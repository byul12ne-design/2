import React, { useState, useEffect } from 'react';
import { 
  ClipboardList, Users, Plus, Copy, ArrowLeft, CheckCircle, 
  Trash2, Trophy, AlertCircle, FileSpreadsheet, Shuffle, Edit 
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, User } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, DocumentData } from 'firebase/firestore';

// --- 인터페이스 정의 (TS 빌드 에러 방지) ---
interface Question {
  text: string;
  options: string[];
  answerIndex: number;
  originalIndex?: number;
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
  const [user, setUser] = useState<User | null>(null);
  const [exams, setExams] = useState<Exam[]>([]);
  const [results, setResults] = useState<ExamResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [view, setView] = useState('home');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
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

  useEffect(() => {
    if (!document.getElementById('tailwind-cdn')) {
      const script = document.createElement('script');
      script.id = 'tailwind-cdn';
      script.src = "https://cdn.tailwindcss.com";
      document.head.appendChild(script);
    }
  }, []);

  useEffect(() => {
    signInAnonymously(auth).catch(err => console.error("Auth error:", err));
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const queryParams = new URLSearchParams(window.location.search);
    const examParam = queryParams.get('exam');
    if (examParam) {
      setCurrentExamId(examParam);
      setView('student-entry');
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsubExams = onSnapshot(collection(db, 'exams'), (snapshot) => {
      const examsData = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Exam));
      setExams(examsData.sort((a, b) => b.createdAt - a.createdAt));
      setIsLoading(false);
    });
    const unsubResults = onSnapshot(collection(db, 'results'), (snapshot) => {
      const resultsData = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ExamResult));
      setResults(resultsData);
    });
    return () => { unsubExams(); unsubResults(); };
  }, [user]);

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleAdminLogin = () => {
    if (adminPasswordInput === '1234') { setView('admin-dash'); setAdminPasswordInput(''); }
    else showToast('비밀번호가 일치하지 않습니다.');
  };

  const updateQuestion = (index: number, field: keyof Question, value: any) => {
    const updated = [...newQuestions];
    if (field === 'text') updated[index].text = value;
    if (field === 'answerIndex') updated[index].answerIndex = parseInt(value);
    setNewQuestions(updated);
  };

  const handleSaveExam = async () => {
    if (!newExamTitle.trim()) return showToast('제목을 입력해주세요.');
    const dCount = parseInt(displayCount) || newQuestions.length;
    const examData = { title: newExamTitle, questions: newQuestions, displayCount: dCount, createdAt: Date.now() };
    try {
      if (editingExamId) await updateDoc(doc(db, 'exams', editingExamId), examData);
      else await addDoc(collection(db, 'exams'), examData);
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
    if (Object.keys(studentAnswers).length < activeQuestions.length) return showToast('모든 문제에 답해주세요.');
    const exam = exams.find(e => e.id === currentExamId);
    if (!exam) return;
    const correct = activeQuestions.filter((q, idx) => studentAnswers[idx] === q.answerIndex).length;
    const score = Math.round((correct / activeQuestions.length) * 100);
    setStudentScore(score);
    await addDoc(collection(db, 'results'), {
      examId: currentExamId, examTitle: exam.title, studentName, score,
      correctCount: correct, totalCount: activeQuestions.length, answers: studentAnswers, createdAt: Date.now()
    });
    setView('student-result');
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <nav className="p-4 bg-white border-b flex justify-between items-center sticky top-0 z-50">
        <h1 onClick={() => setView('home')} className="text-blue-600 font-bold cursor-pointer flex items-center gap-2">
          <ClipboardList size={20}/> QuizMaster
        </h1>
        <div className="text-xs font-medium flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${user ? 'bg-green-500' : 'bg-slate-300'}`}></div>
          {user ? 'Online' : 'Connecting...'}
        </div>
      </nav>

      <main className="p-6 max-w-4xl mx-auto">
        {view === 'home' && (
          <div className="flex flex-col items-center gap-12 py-20">
            <div className="text-center">
              <h2 className="text-5xl font-black text-slate-800 mb-4">Smart Quiz</h2>
              <p className="text-slate-500">누구나 쉽게 만들고 응시하는 문제은행</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full max-w-2xl">
              <button onClick={() => setView('admin-login')} className="p-10 bg-white border-2 border-slate-100 rounded-[2.5rem] shadow-sm hover:border-blue-500 transition-all flex flex-col items-center gap-4">
                <Users size={40} className="text-blue-600"/>
                <span className="text-xl font-bold">관리자 로그인</span>
              </button>
              <div className="p-10 bg-white border-2 border-slate-100 rounded-[2.5rem] shadow-sm flex flex-col items-center gap-4">
                <CheckCircle size={40} className="text-green-500"/>
                <div className="flex gap-2 w-full">
                  <input value={currentExamId} onChange={e => setCurrentExamId(e.target.value)} placeholder="시험 코드" className="border rounded-xl px-3 py-2 w-full text-sm outline-none focus:ring-2 ring-green-100"/>
                  <button onClick={() => currentExamId && setView('student-entry')} className="bg-green-600 text-white px-4 rounded-xl font-bold text-sm">입장</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {view === 'admin-login' && (
          <div className="max-w-md mx-auto py-20 text-center">
            <h2 className="text-2xl font-bold mb-8">관리자 인증</h2>
            <input type="password" value={adminPasswordInput} onChange={e => setAdminPasswordInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAdminLogin()} className="w-full border-2 rounded-2xl p-4 mb-4 outline-none focus:border-blue-500" placeholder="비밀번호를 입력하세요 (1234)"/>
            <button onClick={handleAdminLogin} className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold shadow-lg shadow-blue-100">접속하기</button>
          </div>
        )}

        {view === 'admin-dash' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-2xl font-bold">내 시험 목록</h3>
              <button onClick={() => {setEditingExamId(null); setView('admin-create');}} className="bg-blue-600 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2"><Plus size={18}/>새 시험 생성</button>
            </div>
            <div className="grid gap-4">
              {exams.map(exam => (
                <div key={exam.id} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex justify-between items-center">
                  <div>
                    <h4 className="font-bold text-lg">{exam.title}</h4>
                    <p className="text-sm text-slate-400">문항: {exam.questions.length}개 | 출제: {exam.displayCount}개</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => {setCurrentExamId(exam.id); setView('admin-results');}} className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium">결과 확인</button>
                    <button onClick={async () => {if(confirm('삭제하시겠습니까?')) await deleteDoc(doc(db, 'exams', exam.id))}} className="p-2 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={20}/></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {view === 'admin-create' && (
          <div className="space-y-8 pb-20">
            <div className="flex items-center gap-4">
              <button onClick={() => setView('admin-dash')} className="p-2 hover:bg-white rounded-full"><ArrowLeft/></button>
              <input value={newExamTitle} onChange={e => setNewExamTitle(e.target.value)} className="flex-1 text-3xl font-black border-none outline-none bg-transparent" placeholder="시험 제목을 입력하세요"/>
            </div>
            <div className="bg-blue-50 p-4 rounded-2xl flex items-center gap-4 text-sm font-bold text-blue-700">
              <Shuffle size={18}/> 랜덤 출제 문항 수 : 
              <input type="number" value={displayCount} onChange={e => setDisplayCount(e.target.value)} className="w-16 p-1 rounded border-none outline-none" placeholder="전체"/>
            </div>
            <div className="space-y-4">
              {newQuestions.map((q, i) => (
                <div key={i} className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm space-y-4">
                  <textarea value={q.text} onChange={e => updateQuestion(i, 'text', e.target.value)} className="w-full text-lg font-bold border-none outline-none resize-none" placeholder="문제를 입력하세요..."/>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {q.options.map((opt, oi) => (
                      <input key={oi} value={opt} onChange={e => {const n=[...newQuestions]; n[i].options[oi]=e.target.value; setNewQuestions(n);}} className="bg-slate-50 p-3 rounded-xl text-sm outline-none focus:bg-white focus:ring-2 ring-blue-100" placeholder={`보기 ${oi+1}`}/>
                    ))}
                  </div>
                  <div className="pt-4 flex items-center gap-3">
                    <span className="text-xs font-bold text-slate-400">정답 설정:</span>
                    <div className="flex gap-1">
                      {[0,1,2,3].map(idx => (
                        <button key={idx} onClick={() => updateQuestion(i, 'answerIndex', idx)} className={`w-8 h-8 rounded-lg text-xs font-bold ${q.answerIndex === idx ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>{idx+1}</button>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
              <button onClick={() => setNewQuestions([...newQuestions, {text:'', options:['','','',''], answerIndex:0}])} className="w-full py-5 bg-white border-2 border-dashed border-slate-200 rounded-[2rem] text-slate-400 font-bold hover:border-blue-300 hover:text-blue-500 transition-all">+ 문제 추가하기</button>
            </div>
            <button onClick={handleSaveExam} className="w-full py-6 bg-blue-600 text-white rounded-[2rem] font-black text-xl shadow-xl shadow-blue-100 sticky bottom-4">시험 저장 및 발행</button>
          </div>
        )}

        {view === 'admin-results' && (
          <div className="space-y-6">
            <button onClick={() => setView('admin-dash')} className="flex items-center gap-2 text-slate-400"><ArrowLeft size={18}/> 돌아가기</button>
            <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-50">
              <h3 className="text-2xl font-bold mb-6">응시 현황</h3>
              <div className="space-y-3">
                {results.filter(r => r.examId === currentExamId).map(r => (
                  <div key={r.id} className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl">
                    <span className="font-bold">{r.studentName}</span>
                    <span className="text-blue-600 font-black">{r.score}점</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {view === 'student-entry' && (
          <div className="max-w-md mx-auto py-20 text-center space-y-8">
            <div className="w-20 h-20 bg-blue-600 rounded-3xl rotate-12 mx-auto flex items-center justify-center text-white shadow-xl">
              <ClipboardList size={40} className="-rotate-12"/>
            </div>
            <div>
              <h2 className="text-3xl font-black mb-2">{exams.find(e => e.id === currentExamId)?.title}</h2>
              <p className="text-slate-400">응시를 위해 이름을 입력해 주세요.</p>
            </div>
            <input value={studentName} onChange={e => setStudentName(e.target.value)} className="w-full border-2 rounded-2xl p-4 text-center text-xl font-bold outline-none focus:border-blue-600" placeholder="성함 입력"/>
            <button onClick={startExam} className="w-full bg-blue-600 text-white py-5 rounded-2xl font-bold text-lg shadow-lg">시험 시작하기</button>
          </div>
        )}

        {view === 'student-take' && (
          <div className="max-w-2xl mx-auto space-y-8 pb-20">
            <div className="bg-white/80 backdrop-blur-md p-4 rounded-2xl sticky top-20 z-10 border border-slate-100 flex justify-between items-center shadow-sm">
              <span className="font-bold text-blue-600">{studentName} 님</span>
              <span className="text-xs font-black px-3 py-1 bg-slate-100 rounded-full">{Object.keys(studentAnswers).length} / {activeQuestions.length} 완료</span>
            </div>
            {activeQuestions.map((q, i) => (
              <div key={i} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
                <h4 className="text-xl font-bold mb-6 flex gap-3"><span className="text-blue-600 italic">Q{i+1}.</span>{q.text}</h4>
                <div className="grid gap-3">
                  {q.options.map((opt, oi) => (
                    <button key={oi} onClick={() => setStudentAnswers({...studentAnswers, [i]: oi})} className={`text-left p-5 rounded-2xl border-2 transition-all font-bold ${studentAnswers[i] === oi ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-50 hover:border-slate-100 text-slate-500'}`}>{oi+1}. {opt}</button>
                  ))}
                </div>
              </div>
            ))}
            <button onClick={submitExam} className="w-full py-6 bg-slate-900 text-white rounded-[2.5rem] font-black text-xl shadow-2xl">최종 답안 제출</button>
          </div>
        )}

        {view === 'student-result' && (
          <div className="max-w-md mx-auto py-20 text-center space-y-6">
            <Trophy size={80} className="mx-auto text-yellow-500 mb-4 animate-bounce"/>
            <h2 className="text-4xl font-black">수고하셨습니다!</h2>
            <div className="bg-white p-10 rounded-[3rem] shadow-xl border border-slate-50">
              <p className="text-slate-400 text-sm mb-2">최종 점수</p>
              <div className="text-8xl font-black text-blue-600">{studentScore}<span className="text-2xl text-slate-300 ml-1">점</span></div>
            </div>
            <button onClick={() => setView('home')} className="text-blue-600 font-bold hover:underline">메인으로 돌아가기</button>
          </div>
        )}
      </main>

      {toastMessage && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-slate-800 text-white px-6 py-3 rounded-full text-sm font-bold shadow-2xl z-[100] animate-in fade-in slide-in-from-bottom-4">
          {toastMessage}
        </div>
      )}
    </div>
  );
}