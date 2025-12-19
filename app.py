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
        line = line.strip()
        if not line:
            continue

        if line.startswith('# '):
            # New Section
            if current_section:
                if current_question: 
                    current_section['questions'].append(current_question)
                    current_question = None
                sections.append(current_section)
            
            current_section = {
                "name": line[2:].strip(),
                "questions": []
            }
        
        elif line.startswith('## '):
            # New Question
            if current_question:
                current_section['questions'].append(current_question)
            
            if not current_section:
                # Fallback if question appears before any section
                current_section = {"name": "General", "questions": []}

            current_question = {
                "id": global_question_id,
                "text": line[3:].strip(),
                "options": [],
                "correct": None
            }
            global_question_id += 1
        
        elif line.startswith('- ['):
            # Option
            # Format: - [x] Correct or - [ ] Wrong
            is_correct = line.startswith('- [x]') or line.startswith('- [X]')
            option_text = line[5:].strip()
            
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
    
    all_sections = parse_markdown_questions(QUESTION_FILE)
    
    analytics = {
        "totalScore": 0,
        "maxScore": 0,
        "sections": [],
        "questionAnalysis": [] 
    }
    
    for sec in all_sections:
        sec_stats = {
            "name": sec["name"],
            "correct": 0,
            "incorrect": 0,
            "unanswered": 0,
            "total": len(sec["questions"]),
            "timeTaken": 0,
            "avgTime": 0
        }
        
        for q in sec["questions"]:
            qid = str(q["id"])
            user_ans_id = user_responses.get(qid)
            time_spent = time_log.get(qid, 0)
            
            sec_stats["timeTaken"] += time_spent
            
            status = "unanswered"
            if user_ans_id:
                if user_ans_id == q["correct"]:
                    sec_stats["correct"] += 1
                    analytics["totalScore"] += 1 
                    status = "correct"
                else:
                    sec_stats["incorrect"] += 1
                    status = "incorrect"
            else:
                sec_stats["unanswered"] += 1
                
            # Full detail for Review Mode
            analytics["questionAnalysis"].append({
                "id": q["id"],
                "section": sec["name"],
                "text": q["text"],
                "options": q["options"],
                "userAnswer": user_ans_id,
                "correctAnswer": q["correct"], # Send correct answer now
                "timeSpent": time_spent,
                "status": status
            })
                
        if sec_stats["total"] > 0:
            sec_stats["avgTime"] = sec_stats["timeTaken"] / sec_stats["total"]
        
        analytics["maxScore"] += sec_stats["total"]
        analytics["sections"].append(sec_stats)
        
    return jsonify(analytics)

if __name__ == '__main__':
    app.run(debug=True, port=5000)
