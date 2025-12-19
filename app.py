import re
import os
from flask import Flask, jsonify, render_template, request

app = Flask(__name__)

QUESTION_FILE = 'questions.md'

def parse_markdown_questions(filepath):
    """
    Parses the markdown file into a structured format.
    Returns a list of sections, where each section has a name and a list of questions.
    """
    if not os.path.exists(filepath):
        return []

    with open(filepath, 'r') as f:
        lines = f.readlines()

    sections = []
    current_section = None
    current_question = None
    
    # Structure:
    # [
    #   {
    #     "name": "Section Name",
    #     "questions": [
    #       {
    #         "id": 1,
    #         "text": "Question Text",
    #         "options": [ {"id": "A", "text": "Option 1"}, ... ],
    #         "correct": "A"
    #       }
    #     ]
    #   }
    # ]

    global_question_id = 1

    for line in lines:
        stripped_line = line.strip()
        if not stripped_line:
            continue

        if stripped_line.startswith('# '):
            # New Section
            if current_section:
                if current_question: 
                    current_section['questions'].append(current_question)
                    current_question = None
                sections.append(current_section)
            
            current_section = {
                "name": stripped_line[2:].strip(),
                "questions": []
            }
        
        elif stripped_line.startswith('## '):
            # New Question
            if current_question:
                current_section['questions'].append(current_question)
            
            if not current_section:
                # Fallback if question appears before any section
                current_section = {"name": "General", "questions": []}

            current_question = {
                "id": global_question_id,
                "text": stripped_line[3:].strip(),
                "options": [],
                "correct": None
            }
            global_question_id += 1
        
        elif stripped_line.startswith('- ['):
            # Option
            # Format: - [x] Correct or - [ ] Wrong
            is_correct = stripped_line.startswith('- [x]') or stripped_line.startswith('- [X]')
            option_text = stripped_line[5:].strip()
            
            # Generate option ID (A, B, C...)
            if current_question:
                opt_idx = len(current_question['options'])
                opt_id = chr(65 + opt_idx) # A=65
                
                current_question['options'].append({
                    "id": opt_id,
                    "text": option_text
                })
                
                if is_correct:
                    current_question['correct'] = opt_id

        else:
            # Maybe continuation of question text?
            # If we represent newlines, we should probably append them.
            # Only append if we are inside a question and have NO options yet.
            if current_question and not current_question['options']:
                # Append with newline to preserve structure
                current_question['text'] += "\n" + stripped_line

    # Append trailing items
    if current_question and current_section:
        current_section['questions'].append(current_question)
    if current_section:
        sections.append(current_section)

    return sections

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/exam-config')
def get_exam_config():
    sections = parse_markdown_questions(QUESTION_FILE)
    # Flatten questions for easier frontend navigation if needed, 
    # but strictly maintaining section hierarchy is better for analytics.
    
    total_questions = sum(len(s['questions']) for s in sections)
    
    # Remove 'correct' answer from client payload to prevent cheating
    client_sections = []
    for sec in sections:
        client_sec = {
            "name": sec["name"],
            "questions": []
        }
        for q in sec["questions"]:
            client_q = {
                "id": q["id"],
                "text": q["text"],
                "options": q["options"]
                # No 'correct' field
            }
            client_sec["questions"].append(client_q)
        client_sections.append(client_sec)

    return jsonify({
        "sections": client_sections,
        "totalQuestions": total_questions,
        "durationSeconds": 1800 # 30 minutes default
    })

@app.route('/api/submit', methods=['POST'])
def submit_exam():
    data = request.json
    user_responses = data.get('responses', {})
    time_log = data.get('timeLog', {})
    
    all_sections = parse_markdown_questions(QUESTION_FILE) # Renamed from 'config' to 'all_sections' for clarity
    
    section_stats = {}
    total_correct = 0
    total_questions = 0
    net_score = 0
    
    question_analysis = []
    
    # Initialize stats for each section
    for sec in all_sections:
        section_stats[sec['name']] = {
            'name': sec['name'],
            'total': 0,
            'correct': 0,
            'timeTaken': 0,
            'score': 0
        }
        
    total_answered = 0
    
    for sec in all_sections:
        for q in sec['questions']:
            q_id = str(q['id']) 
            user_ans = user_responses.get(q_id)
            correct_ans = q['correct'] 
            time_spent = time_log.get(q_id, 0)
            
            is_correct = (user_ans == correct_ans)
            status = 'unanswered'
            
            # Scoring Logic: +4 Correct, -1 Incorrect, 0 Unanswered
            points = 0
            if user_ans:
                total_answered += 1
                if is_correct:
                    points = 4
                    status = 'correct'
                    total_correct += 1
                    section_stats[sec['name']]['correct'] += 1
                else:
                    points = -1
                    status = 'incorrect'
            
            section_stats[sec['name']]['total'] += 1
            section_stats[sec['name']]['timeTaken'] += time_spent
            section_stats[sec['name']]['score'] += points
            
            net_score += points
            total_questions += 1
            
            question_analysis.append({
                'id': q['id'],
                'section': sec['name'],
                'text': q['text'],
                'options': [{'id': o['id'], 'text': o['text']} for o in q['options']],
                'userAnswer': user_ans,
                'correctAnswer': correct_ans,
                'timeSpent': time_spent,
                'status': status,
                'points': points
            })

    return jsonify({
        'correctCount': total_correct,
        'totalQuestions': total_questions,
        'countAnswered': total_answered,
        'countMissed': total_questions - total_answered,
        'netScore': net_score,
        'maxPossibleScore': total_questions * 4,
        'sections': list(section_stats.values()),
        'questionAnalysis': question_analysis
    })

if __name__ == '__main__':
    app.run(debug=True, port=5000)
