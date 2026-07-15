
from flask import Flask, request, jsonify, send_file
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score
import os
import sys

DATA_PATH = 'heart_disease_data.csv'
MODEL_FEATURE_COUNT = 13

app = Flask(__name__, static_folder='.')

model = None
test_acc = None

if os.path.exists(DATA_PATH):
    df = pd.read_csv(DATA_PATH)
    X = df.drop(columns='target', axis=1)
    Y = df['target']
    X_train, X_test, Y_train, Y_test = train_test_split(X, Y, test_size=0.2, stratify=Y, random_state=2)
    model = LogisticRegression(max_iter=1000, solver='lbfgs')
    model.fit(X_train, Y_train)
    test_acc = float(accuracy_score(model.predict(X_test), Y_test))

@app.route('/')
def index():
    return send_file('index.html')

@app.route('/predict', methods=['POST'])
def predict():
    if model is None:
        return jsonify({'error': 'Model not loaded.'}), 400
    body = request.get_json(force=True)
    features = body.get('features')
    if not isinstance(features, (list, tuple)) or len(features) != MODEL_FEATURE_COUNT:
        return jsonify({'error': f'features must be a list of {MODEL_FEATURE_COUNT} values'}), 400
    try:
        arr = np.array(features, dtype=float).reshape(1, -1)
        pred = int(model.predict(arr)[0])
        return jsonify({'prediction': pred, 'accuracy': round(test_acc, 3)})
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
