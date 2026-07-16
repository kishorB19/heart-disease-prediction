
from flask import Flask, request, jsonify, send_file, session
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import make_pipeline
from sklearn.ensemble import RandomForestClassifier, VotingClassifier
from sklearn.svm import SVC
from sklearn.neighbors import KNeighborsClassifier
import os
import sys
from pymongo import MongoClient
from bson import ObjectId
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash

DATA_PATH = 'heart_disease_data.csv'
MODEL_FEATURE_COUNT = 13
MONGO_URI = 'mongodb+srv://kmbirajdar1965_db_user:uQegFRi3OxjCfcsO@cluster0.wxosk0d.mongodb.net/'

app = Flask(__name__, static_folder='.')
app.secret_key = os.environ.get('SECRET_KEY', 'heart-check-super-secret-key-12345')

model = None
test_acc = None

try:
    client = MongoClient(MONGO_URI)
    db = client['heart_disease_db']
    users_col = db['users']
    history_col = db['patient_history']
except Exception as e:
    print(f"MongoDB connection failed: {e}")
    sys.exit(1)

if os.path.exists(DATA_PATH):
    df = pd.read_csv(DATA_PATH)
    X = df.drop(columns='target', axis=1)
    Y = df['target'].map({0: 1, 1: 0})
    X_train, X_test, Y_train, Y_test = train_test_split(X, Y, test_size=0.2, stratify=Y, random_state=39)
    
    rf = RandomForestClassifier(max_depth=4, n_estimators=150, random_state=2)
    svc_scaled = make_pipeline(StandardScaler(), SVC(C=1.0, kernel='rbf', probability=True, random_state=2))
    lr_scaled = make_pipeline(StandardScaler(), LogisticRegression(C=0.1, max_iter=1000, random_state=2))
    knn_scaled = make_pipeline(StandardScaler(), KNeighborsClassifier(n_neighbors=15))
    
    model = VotingClassifier(
        estimators=[
            ('rf', rf),
            ('svc', svc_scaled),
            ('lr', lr_scaled),
            ('knn', knn_scaled)
        ],
        voting='soft'
    )
    model.fit(X_train, Y_train)
    test_acc = float(accuracy_score(model.predict(X_test), Y_test))

@app.route('/')
def index():
    return send_file('index.html')

@app.route('/style.css')
def style():
    return send_file('style.css')

@app.route('/app.js')
def app_js():
    return send_file('app.js')

@app.route('/predict', methods=['POST'])
def predict():
    if model is None:
        return jsonify({'error': 'Model not loaded.'}), 400
    body = request.get_json(force=True)
    features = body.get('features')
    if not isinstance(features, (list, tuple)) or len(features) != MODEL_FEATURE_COUNT:
        return jsonify({'error': f'features must be a list of {MODEL_FEATURE_COUNT} values'}), 400
    try:
        df_cols = ['age', 'sex', 'cp', 'trestbps', 'chol', 'fbs', 'restecg', 'thalach', 'exang', 'oldpeak', 'slope', 'ca', 'thal']
        features_float = [float(x) for x in features]
        arr = pd.DataFrame([features_float], columns=df_cols)
        pred = int(model.predict(arr)[0])
        prob_disease = float(model.predict_proba(arr)[0][1])
        return jsonify({
            'prediction': pred, 
            'accuracy': round(test_acc, 3),
            'confidence': round(prob_disease, 3)
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/register', methods=['POST'])
def register():
    body = request.get_json(force=True)
    username = body.get('username', '').strip()
    password = body.get('password', '').strip()
    role = body.get('role', 'doctor').strip().lower()
    
    if not username or not password:
        return jsonify({'error': 'Username and password are required'}), 400
    if role not in ['doctor', 'patient']:
        role = 'doctor'
    
    try:
        if users_col.find_one({'username': username}):
            return jsonify({'error': 'Username already exists'}), 400
            
        password_hash = generate_password_hash(password)
        users_col.insert_one({'username': username, 'password_hash': password_hash, 'role': role})
        return jsonify({'success': True, 'message': 'User registered successfully'}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/login', methods=['POST'])
def login():
    body = request.get_json(force=True)
    username = body.get('username', '').strip()
    password = body.get('password', '').strip()
    if not username or not password:
        return jsonify({'error': 'Username and password are required'}), 400
    
    try:
        user = users_col.find_one({'username': username})
        if user and check_password_hash(user['password_hash'], password):
            session['user_id'] = str(user['_id'])
            session['username'] = user['username']
            session['role'] = user.get('role', 'doctor')
            return jsonify({'success': True, 'username': user['username'], 'role': session['role']})
        else:
            return jsonify({'error': 'Invalid username or password'}), 401
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'success': True})

@app.route('/api/session', methods=['GET'])
def get_session():
    if 'user_id' in session:
        return jsonify({
            'logged_in': True, 
            'username': session['username'],
            'role': session.get('role', 'doctor')
        })
    return jsonify({'logged_in': False})

@app.route('/api/history', methods=['GET', 'POST'])
def handle_history():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized. Please log in.'}), 401
    
    user_id = session['user_id']
    role = session.get('role', 'doctor')
    username = session['username']
    
    if request.method == 'GET':
        try:
            if role == 'patient':
                records = list(history_col.find({'patient_name': username}).sort('created_at', -1))
            else:
                records = list(history_col.find({}).sort('created_at', -1))
                
            history_list = []
            for r in records:
                history_list.append({
                    'id': str(r['_id']),
                    'patient_name': r['patient_name'],
                    'age': r['age'],
                    'sex': r['sex'],
                    'cp': r['cp'],
                    'trestbps': r['trestbps'],
                    'chol': r['chol'],
                    'fbs': r['fbs'],
                    'restecg': r['restecg'],
                    'thalach': r['thalach'],
                    'exang': r['exang'],
                    'oldpeak': r['oldpeak'],
                    'slope': r['slope'],
                    'ca': r['ca'],
                    'thal': r['thal'],
                    'prediction': r['prediction'],
                    'accuracy': r['accuracy'],
                    'confidence': r.get('confidence'),
                    'created_at': r['created_at'].isoformat() if hasattr(r['created_at'], 'isoformat') else str(r['created_at'])
                })
            return jsonify(history_list)
        except Exception as e:
            return jsonify({'error': str(e)}), 500
        
    elif request.method == 'POST':
        body = request.get_json(force=True)
        patient_name = body.get('patient_name', '').strip()
        features = body.get('features')
        prediction = body.get('prediction')
        accuracy = body.get('accuracy')
        confidence = body.get('confidence')
        
        if role == 'patient':
            patient_name = username
            
        if not patient_name:
            return jsonify({'error': 'Patient name/ID is required'}), 400
        if not isinstance(features, (list, tuple)) or len(features) != MODEL_FEATURE_COUNT:
            return jsonify({'error': f'features must be a list of {MODEL_FEATURE_COUNT} values'}), 400
        
        try:
            doc = {
                'user_id': user_id,
                'patient_name': patient_name,
                'age': int(features[0]),
                'sex': int(features[1]),
                'cp': int(features[2]),
                'trestbps': int(features[3]),
                'chol': int(features[4]),
                'fbs': int(features[5]),
                'restecg': int(features[6]),
                'thalach': int(features[7]),
                'exang': int(features[8]),
                'oldpeak': float(features[9]),
                'slope': int(features[10]),
                'ca': int(features[11]),
                'thal': int(features[12]),
                'prediction': int(prediction),
                'accuracy': float(accuracy),
                'confidence': float(confidence) if confidence is not None else None,
                'created_at': datetime.utcnow()
            }
            result = history_col.insert_one(doc)
            return jsonify({'success': True, 'message': 'Patient record saved successfully', 'id': str(result.inserted_id)}), 201
        except Exception as e:
            return jsonify({'error': str(e)}), 500

@app.route('/api/history/<record_id>', methods=['DELETE'])
def delete_history(record_id):
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized. Please log in.'}), 401
        
    role = session.get('role', 'doctor')
    if role != 'doctor':
        return jsonify({'error': 'Forbidden. Only doctors can delete checkup logs.'}), 403
    
    user_id = session['user_id']
    try:
        oid = ObjectId(record_id)
    except Exception:
        return jsonify({'error': 'Invalid record ID'}), 400
        
    try:
        res = history_col.delete_one({'_id': oid})
        if res.deleted_count == 0:
            return jsonify({'error': 'Record not found'}), 404
        return jsonify({'success': True, 'message': 'Record deleted successfully'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/history/patient/<path:patient_name>', methods=['DELETE'])
def delete_patient_history(patient_name):
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized. Please log in.'}), 401
        
    role = session.get('role', 'doctor')
    if role != 'doctor':
        return jsonify({'error': 'Forbidden. Only doctors can delete patient history.'}), 403
    
    try:
        res = history_col.delete_many({'patient_name': patient_name.strip()})
        if res.deleted_count == 0:
            return jsonify({'error': 'Patient records not found'}), 404
        return jsonify({'success': True, 'message': f'Deleted all {res.deleted_count} records for {patient_name}'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


def cli_mode():
    print("\n-- CLI mode (no dataset found). Answer the questions --\n")
    q = [
        ('age', 'Age (years)', 'number'),
        ('sex', 'Sex (1=male, 0=female)', 'number'),
        ('cp', 'Chest pain type (0-3). See frontend for options.', 'number'),
        ('trestbps', 'Resting blood pressure (mm Hg)', 'number'),
        ('chol', 'Serum cholesterol (mg/dl)', 'number'),
        ('fbs', 'Fasting blood sugar >120 mg/dl (1=yes,0=no)', 'number'),
        ('restecg', 'Resting ECG results (0-2). See frontend.', 'number'),
        ('thalach', 'Max heart rate achieved', 'number'),
        ('exang', 'Exercise induced angina (1=yes,0=no)', 'number'),
        ('oldpeak', 'ST depression (oldpeak)', 'number'),
        ('slope', 'Slope of peak exercise ST (0-2). See frontend.', 'number'),
        ('ca', 'Number of major vessels (0-3) colored by flouroscopy', 'number'),
        ('thal', 'Thalassemia (1=normal,2=fixed,3=reversible)', 'number')
    ]
    answers = []
    for key, prompt, _ in q:
        while True:
            try:
                val = input(f'{prompt}: ').strip()
                if val == '':
                    val = '0'
                answers.append(float(val))
                break
            except ValueError:
                print("Please enter a numeric value.")
    print("\nYou entered (in order):")
    print(answers)
    print("\nTo get real predictions, put 'heart_disease_data.csv' in this folder and re-run this script.")
    sys.exit(0)

if __name__ == '__main__':
    if model is None:
        cli_mode()
    else:
        app.run(host='127.0.0.1', port=5000, debug=True)
