import React, { useState, useEffect } from 'react';
import { 
  ClipboardList, Users, Plus, Copy, ArrowLeft, CheckCircle, 
  Trash2, Trophy, AlertCircle, FileSpreadsheet, Shuffle, Edit 
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, User } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';

// --- 인터페이스 정의 (TypeScript 에러 해결의 핵심) ---
interface Question {
  text: string;
  options: string[];
  answerIndex: number;
  originalIndex?: number; // 학생 응시 시 랜덤 셔플 대응용
}

interface Exam {
  id: string;
  title: string;
  questions: Question[];
  displayCount: number;
  createdAt: number;
}

interface ExamResult {
  id: string;
  examId: string;
  examTitle: string;
  studentName: string;
  score: number;
  correctCount: number;
  totalCount: number;
  answers: Record<number, number>;
  createdAt: number;
}

// --- Firebase Config ---
const firebaseConfig = {
  apiKey: "AIzaSyAIBp1x4DalwhtlFnYjnz2TisQBA0wVBSg",
  authDomain: "product-exam-9b794.firebaseapp.com",
  projectId: "product-exam-9b794",
  storageBucket: "product-exam-9b794.firebasestorage.app",
  messagingSenderId: "443959122996",
  appId: "1:443959122996:web:355714f3a0c809b9ebbe61",
  measurementId: "G-X5NVNL1G96"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export default function App() {
  // --- Auth & Data State (타입 지정) ---
  const [user, setUser] = useState<User | null>(null);
  const [exams, setExams] = useState<Exam[]>([]);
  const [results, setResults] = useState<ExamResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // --- UI State ---
  const [view, setView] = useState('home');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // --- Active Items State ---
  const [currentExamId, setCurrentExamId] = useState('');
  const [studentName, setStudentName] = useState('');
  const [adminPasswordInput, setAdminPasswordInput] = useState(''); 
  
  const [editingExamId, setEditingExamId] = useState<string | null>(null);
  const [newExamTitle, setNewExamTitle] = useState('');
  const [displayCount, setDisplayCount] = useState('');
  const [newQuestions, setNewQuestions] = useState<Question[]>([
    { text: '', options: ['', '', '', ''], answerIndex: 0 }
  ]);
  
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [bulkData, setBulkData] = useState('');

  const [activeQuestions, setActiveQuestions] = useState<Question[]>([]);
  const [studentAnswers, setStudentAnswers] = useState<Record<number, number>>({});
  const [studentScore, setStudentScore] = useState(0);

  // --- Tailwind Loader ---
  useEffect(() => {
    if (!document.getElementById('tailwind-cdn')) {
      const script = document.createElement('script');
      script.id = 'tailwind-cdn';
      script.src = "https://cdn.tailwindcss.com";
      document.head.appendChild(script);
    }
  }, []);

  // --- Firebase Auth ---
  useEffect(() => {
    signInAnonymously(auth).catch(err => console.error("Auth error:", err));
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  // --- URL Params ---
  useEffect(() => {
    const queryParams = new URLSearchParams(window.location.search);
    const examParam = queryParams.get('exam');
    if (examParam) {
      setCurrentExamId(examParam);
      setView('student-entry');
    }
  }, []);

  // --- Firestore Listeners ---
  useEffect(() => {
    if (!user) return;
    const unsubExams = onSnapshot(collection(db, 'exams'), (snapshot) => {
      const examsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Exam));
      setExams(examsData.sort((a, b) => b.createdAt - a.createdAt));
      setIsLoading(false);
    });

    const unsubResults = onSnapshot(collection(db, 'results'), (snapshot) => {
      const resultsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ExamResult));
      setResults(resultsData);
    });

    return () => { unsubExams(); unsubResults(); };
  }, [user]);

  // --- Helpers ---
  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleCopyLink = (examId: string) => {
    const baseUrl = window.location.href.split('?')[0];
    const link = `${baseUrl}?exam=${examId}`;
    navigator.clipboard.writeText(link).then(() => showToast('링크가 복사되었습니다!'));
  };

  const handleAdminLogin = () => {
    if (adminPasswordInput === '1234') {
      setView('admin-dash');
      setAdminPasswordInput(''); 
    } else {
      showToast('비밀번호가 일치하지 않습니다.');
    }
  };

  const handleEditClick = (exam: Exam) => {
    setEditingExamId(exam.id);
    setNewExamTitle(exam.title);
    setDisplayCount(exam.displayCount ? exam.displayCount.toString() : '');
    setNewQuestions(JSON.parse(JSON.stringify(exam.questions)));
    setView('admin-create');
  };

  const updateQuestion = (index: number, field: keyof Question, value: any) => {
    const updated = [...newQuestions];
    if (field === 'text') updated[index].text = value;
    if (field === 'answerIndex') updated[index].answerIndex = parseInt(value);
    setNewQuestions(updated);
  };

  const updateOption = (qIndex: number, optIndex: number, value: string) => {
    const updated = [...newQuestions];
    updated[qIndex].options[optIndex] = value;
    setNewQuestions(updated);
  };

  const handleBulkUpload = () => {
    const rows = bulkData.split('\n').filter(r => r.trim());
    const parsed: Question[] = rows.map(row => {
      const sep = row.includes('\t') ? '\t' : ',';
      const cols = row.split(sep).map(c => c.trim());
      return {
        text: cols[0],
        options: [cols[1], cols[2], cols[3], cols[4]],
        answerIndex: (parseInt(cols[5]) || 1) - 1
      };
    }).filter(q => q.text && q.options.length === 4);

    if (parsed.length > 0) {
      setNewQuestions(parsed);
      setShowBulkUpload(false);
      showToast(`${parsed.length}개 문제 변환 완료!`);
    }
  };

  const handleSaveExam = async () => {
    if (!newExamTitle.trim()) return showToast('제목을 입력해주세요.');
    const dCount = parseInt(displayCount) || newQuestions.length;
    const examData = {
      title: newExamTitle,
      questions: newQuestions,
      displayCount: dCount,
      createdAt: Date.now()
    };

    try {
      if (editingExamId) {
        await updateDoc(doc(db, 'exams', editingExamId), examData);
      } else {
        await addDoc(collection(db, 'exams'), examData);
      }
      setView('admin-dash');
      showToast('저장되었습니다.');
    } catch (e) { showToast('저장 실패'); }
  };

  const startExam = () => {
    if (!studentName.trim()) return showToast('이름을 입력하세요.');
    const exam = exams.find(e => e.id === currentExamId);
    if (!exam) return;

    let pool = exam.questions.map((q, idx) => ({ ...q, originalIndex: idx }));
    let shuffled = pool.sort(() => Math.random() - 0.5).slice(0, exam.displayCount || pool.length);
    
    setActiveQuestions(shuffled);
    setStudentAnswers({});
    setView('student-take');
  };

  const submitExam = async () => {
    if (Object.keys(studentAnswers).length < activeQuestions.length) {
      return showToast('모든 문제에 답해주세요.');
    }
    const exam = exams.find(e => e.id === currentExamId);
    if (!exam) return;

    const correct = activeQuestions.filter((q, idx) => studentAnswers[idx] === q.answerIndex).length;
    const score = Math.round((correct / activeQuestions.length) * 100);
    setStudentScore(score);

    await addDoc(collection(db, 'results'), {
      examId: currentExamId,
      examTitle: exam.title,
      studentName,
      score,
      correctCount: correct,
      totalCount: activeQuestions.length,
      answers: studentAnswers,
      createdAt: Date.now()
    });
    setView('student-result');
  };

  // --- Render (기존 로직과 동일하나 TS 에러 방지 처리됨) ---
  const currentExamData = exams.find(e => e.id === currentExamId);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* UI 부분은 이전과 동일하되, 에러가 났던 맵핑 부분만 안전하게 처리 */}
      <nav className="p-4 bg-white border-b flex justify-between items-center">
        <h1 onClick={() => setView('home')} className="text-blue-600 font-bold cursor-pointer">QuizMaster</h1>
        <span className="text-xs">{user ? '● Online' : '○ Offline'}</span>
      </nav>

      <main className="p-6 max-w-4xl mx-auto">
        {view === 'home' && (
          <div className="flex flex-col items-center gap-8 py-20">
            <h2 className="text-4xl font-black text-gray-800">스마트 문제은행</h2>
            <div className="grid grid-cols-2 gap-4 w-full">
              <button onClick={() => setView('admin-login')} className="p-10 bg-white border rounded-3xl shadow hover:shadow-lg transition-all">관리자 로그인</button>
              <div className="p-10 bg-white border rounded-3xl shadow flex gap-2">
                <input value={currentExamId} onChange={e => setCurrentExamId(e.target.value)} placeholder="시험 코드" className="border p-2 rounded w-full"/>
                <button onClick={() => currentExamId && setView('student-entry')} className="bg-blue-600 text-white px-4 rounded">입장</button>
              </div>
            </div>
          </div>
        )}

        {view === 'admin-login' && (
          <div className="max-w-md mx-auto py-20">
            <input type="password" value={adminPasswordInput} onChange={e => setAdminPasswordInput(e.target.value)} className="w-full border p-4 rounded-xl mb-4" placeholder="비밀번호 1234"/>
            <button onClick={handleAdminLogin} className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold">인증하기</button>
          </div>
        )}

        {view === 'admin-dash' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-2xl font-bold">시험 목록</h3>
              <button onClick={() => {setEditingExamId(null); setView('admin-create');}} className="bg-blue-600 text-white px-4 py-2 rounded-lg">+ 새 시험</button>
            </div>
            {exams.map(exam => (
              <div key={exam.id} className="bg-white p-4 rounded-xl border flex justify-between items-center">
                <div>
                  <div className="font-bold">{exam.title}</div>
                  <div className="text-xs text-gray-400">문항 수: {exam.questions.length}</div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleEditClick(exam)} className="p-2 bg-gray-100 rounded">편집</button>
                  <button onClick={() => {setCurrentExamId(exam.id); setView('admin-results');}} className="p-2 bg-blue-50 text-blue-600 rounded">결과</button>
                  <button onClick={() => handleCopyLink(exam.id)} className="p-2 bg-green-50 text-green-600 rounded">링크</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {view === 'admin-create' && (
          <div className="space-y-6">
            <input value={newExamTitle} onChange={e => setNewExamTitle(e.target.value)} className="w-full text-2xl font-bold border-b p-2 outline-none" placeholder="시험 제목"/>
            <div className="flex gap-2 items-center text-sm">
              <span>랜덤 출제 문항 수:</span>
              <input type="number" value={displayCount} onChange={e => setDisplayCount(e.target.value)} className="border p-1 w-20"/>
            </div>
            {newQuestions.map((q, i) => (
              <div key={i} className="bg-white p-6 rounded-2xl border space-y-4">
                <textarea value={q.text} onChange={e => updateQuestion(i, 'text', e.target.value)} className="w-full border-b outline-none" placeholder="문제를 입력하세요"/>
                <div className="grid grid-cols-2 gap-2">
                  {q.options.map((opt, oi) => (
                    <input key={oi} value={opt} onChange={e => updateOption(i, oi, e.target.value)} className="bg-gray-50 p-2 rounded" placeholder={`보기 ${oi+1}`}/>
                  ))}
                </div>
                <select value={q.answerIndex} onChange={e => updateQuestion(i, 'answerIndex', e.target.value)} className="text-sm text-blue-600">
                  <option value={0}>정답: 1번</option>
                  <option value={1}>정답: 2번</option>
                  <option value={2}>정답: 3번</option>
                  <option value={3}>정답: 4번</option>
                </select>
              </div>
            ))}
            <button onClick={handleSaveExam} className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold">시험 저장하기</button>
          </div>
        )}

        {view === 'student-entry' && currentExamData && (
          <div className="max-w-md mx-auto text-center space-y-6 py-20">
            <h2 className="text-2xl font-bold">{currentExamData.title}</h2>
            <input value={studentName} onChange={e => setStudentName(e.target.value)} className="w-full border p-4 rounded-xl text-center" placeholder="이름을 입력하세요"/>
            <button onClick={startExam} className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold">시험 시작</button>
          </div>
        )}

        {view === 'student-take' && (
          <div className="space-y-8 pb-20">
            {activeQuestions.map((q, i) => (
              <div key={i} className="bg-white p-6 rounded-2xl border shadow-sm">
                <h4 className="text-lg font-bold mb-4">Q{i+1}. {q.text}</h4>
                <div className="space-y-2">
                  {q.options.map((opt, oi) => (
                    <button key={oi} onClick={() => setStudentAnswers({...studentAnswers, [i]: oi})} className={`w-full p-4 rounded-xl border text-left transition-all ${studentAnswers[i] === oi ? 'border-blue-600 bg-blue-50' : ''}`}>{oi+1}. {opt}</button>
                  ))}
                </div>
              </div>
            ))}
            <button onClick={submitExam} className="w-full bg-blue-600 text-white py-6 rounded-2xl font-bold text-xl">답안 제출하기</button>
          </div>
        )}

        {view === 'student-result' && (
          <div className="text-center py-20 space-y-4">
            <h2 className="text-4xl font-black text-blue-600">{studentScore}점</h2>
            <p className="text-gray-500">수고하셨습니다, {studentName}님!</p>
            <button onClick={() => setView('home')} className="text-blue-600 underline">홈으로 돌아가기</button>
          </div>
        )}
      </main>

      {toastMessage && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-black/80 text-white px-6 py-3 rounded-full text-sm">{toastMessage}</div>
      )}
    </div>
  );
}
npm run dev
