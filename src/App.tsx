import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, type User } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, setDoc, getDoc } from 'firebase/firestore';

// --- 인터페이스 정의 ---
interface Question {
  text: string;
  options: string[];
  answerIndex: number;
  explanation: string;
}

interface Exam {
  id: string;
  title: string;
  notice?: string;
  questions: Question[];
  displayCount: number;
  createdAt: number;
  mode: 'study' | 'test'; // study: 소거형 학습, test: 일괄 채점 시험
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
  activeQuestions: Question[]; 
  createdAt: number;
  mode: 'study' | 'test';
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
  const [view, setView] = useState('home');
  const [adminTab, setAdminTab] = useState('exams');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  
  const [currentExamId, setCurrentExamId] = useState('');
  const [studentName, setStudentName] = useState('');
  
  // --- 공통 응시 상태 ---
  const [activeQuestions, setActiveQuestions] = useState<Question[]>([]);
  const [firstAttemptAnswers, setFirstAttemptAnswers] = useState<Record<number, number>>({});
  const [studentScore, setStudentScore] = useState(0);

  // --- [학습 모드] 전용 상태 ---
  const [questionQueue, setQuestionQueue] = useState<{q: Question, originalIndex: number}[]>([]);
  const [isAnswerChecked, setIsAnswerChecked] = useState(false);
  const [currentSelectedOption, setCurrentSelectedOption] = useState<number | null>(null);

  // --- [시험 모드] 전용 상태 ---
  const [currentTestIndex, setCurrentTestIndex] = useState(0);
  const [testAnswers, setTestAnswers] = useState<Record<number, number>>({});

  // --- 관리자 전용 상태 ---
  const [adminPasswordInput, setAdminPasswordInput] = useState(''); 
  const [editingExamId, setEditingExamId] = useState<string | null>(null);
  const [customExamId, setCustomExamId] = useState(''); 
  const [newExamTitle, setNewExamTitle] = useState('');
  const [newExamNotice, setNewExamNotice] = useState('');
  const [newExamMode, setNewExamMode] = useState<'study' | 'test'>('study');
  const [displayCount, setDisplayCount] = useState('');
  const [newQuestions, setNewQuestions] = useState<Question[]>([
    { text: '', options: ['', '', '', ''], answerIndex: 0, explanation: '' }
  ]);

  useEffect(() => {
    if (!document.getElementById('tailwind-cdn')) {
      const script = document.createElement('script');
      script.id = 'tailwind-cdn';
      script.src = "https://cdn.tailwindcss.com";
      document.head.appendChild(script);
    }
    const params = new URLSearchParams(window.location.search);
    const linkExamId = params.get('examId');
    if (linkExamId) {
      setCurrentExamId(linkExamId);
      setView('student-entry');
    }
  }, []);

  useEffect(() => {
    signInAnonymously(auth).catch(err => console.error(err));
    return onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsubExams = onSnapshot(collection(db, 'exams'), (snapshot) => {
      setExams(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Exam)).sort((a, b) => b.createdAt - a.createdAt));
    });
    const unsubResults = onSnapshot(collection(db, 'results'), (snapshot) => {
      setResults(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ExamResult)).sort((a, b) => b.createdAt - a.createdAt));
    });
    return () => { unsubExams(); unsubResults(); };
  }, [user]);

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const copyToClipboard = (examId: string) => {
    const url = `${window.location.origin}${window.location.pathname}?examId=${examId}`;
    navigator.clipboard.writeText(url);
    showToast('응시 링크가 복사되었습니다!');
  };

  const handleAdminLogin = () => {
    if (adminPasswordInput === '2026') { 
      setView('admin-dash'); setAdminPasswordInput(''); 
      window.history.replaceState({}, '', window.location.pathname);
    } else showToast('비밀번호 불일치');
  };

  const handleEditExam = (exam: Exam) => {
    setEditingExamId(exam.id);
    setCustomExamId(exam.id);
    setNewExamTitle(exam.title);
    setNewExamNotice(exam.notice || '');
    setNewExamMode(exam.mode || 'study');
    setNewQuestions(JSON.parse(JSON.stringify(exam.questions)));
    setDisplayCount(exam.displayCount?.toString() || '');
    setView('admin-create');
  };

  const handleSaveExam = async () => {
    if (!newExamTitle.trim()) return showToast('제목을 입력해주세요.');
    let finalId = customExamId.trim().replace(/\s+/g, '-'); 
    if (!finalId) {
        finalId = editingExamId || Math.random().toString(36).substring(2, 8).toUpperCase();
    }
    const dCount = parseInt(displayCount) || newQuestions.length;
    const cleanedQuestions = newQuestions.map(q => ({...q, explanation: q.explanation || ''}));

    const examData = { 
      title: newExamTitle, 
      notice: newExamNotice,
      mode: newExamMode,
      questions: cleanedQuestions, 
      displayCount: dCount, 
      createdAt: Date.now() 
    };

    try {
      if (editingExamId && editingExamId !== finalId) {
          const docSnap = await getDoc(doc(db, 'exams', finalId));
          if (docSnap.exists()) return showToast('이미 사용 중인 시험 코드입니다.');
          await setDoc(doc(db, 'exams', finalId), examData);
          await deleteDoc(doc(db, 'exams', editingExamId));
      } else {
          await setDoc(doc(db, 'exams', finalId), examData);
      }
      setView('admin-dash'); showToast('저장되었습니다.');
      setEditingExamId(null);
    } catch (e) { showToast('저장 실패'); }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result as string;
      const lines = content.split(/\r?\n/);
      const parsedFromFile: Question[] = lines.slice(0).map(line => {
        const cols = line.split(',').map(c => c.replace(/^"|"$/g, '').trim());
        return {
          text: cols[0],
          options: [cols[1], cols[2], cols[3], cols[4]],
          answerIndex: parseInt(cols[5]) - 1,
          explanation: cols[6] || ''
        };
      }).filter(q => q.text && !isNaN(q.answerIndex));
      
      if (parsedFromFile.length > 0) { 
        setNewQuestions(prev => [...prev.filter(q => q.text.trim() !== ''), ...parsedFromFile]);
        showToast(`${parsedFromFile.length}문제가 추가되었습니다!`); 
      }
    };
    reader.readAsText(file);
    e.target.value = ''; 
  };

  const startExam = () => {
    if (!studentName.trim()) return showToast('성함을 입력하세요.');
    const exam = exams.find(e => e.id === currentExamId);
    if (!exam) return showToast('시험 코드를 확인하세요.');
    
    const pool = [...exam.questions];
    const finalCount = parseInt(exam.displayCount?.toString() || pool.length.toString());
    const selectedQuestions = pool.sort(() => Math.random() - 0.5).slice(0, finalCount);
    
    setActiveQuestions(selectedQuestions);
    setFirstAttemptAnswers({});
    
    if (exam.mode === 'test') {
      setCurrentTestIndex(0);
      setTestAnswers({});
    } else {
      setQuestionQueue(selectedQuestions.map((q, idx) => ({q, originalIndex: idx})));
      setIsAnswerChecked(false);
      setCurrentSelectedOption(null);
    }
    setView('student-take');
  };

  // [학습 모드] 옵션 클릭
  const handleStudyOptionClick = (optionIndex: number) => {
    if (isAnswerChecked) return;
    const currentItem = questionQueue[0];
    setCurrentSelectedOption(optionIndex);
    setIsAnswerChecked(true);
    if (firstAttemptAnswers[currentItem.originalIndex] === undefined) {
      setFirstAttemptAnswers(prev => ({...prev, [currentItem.originalIndex]: optionIndex}));
    }
  };

  const handleStudyNext = () => {
    const currentItem = questionQueue[0];
    const isCorrect = currentSelectedOption === currentItem.q.answerIndex;
    let nextQueue = [...questionQueue];
    const shifted = nextQueue.shift();
    if (!isCorrect && shifted) nextQueue.push(shifted);
    
    setQuestionQueue(nextQueue);
    setIsAnswerChecked(false);
    setCurrentSelectedOption(null);
    if (nextQueue.length === 0) submitExam(firstAttemptAnswers);
  };

  // [시험 모드] 옵션 클릭
  const handleTestOptionClick = (optionIndex: number) => {
    setTestAnswers(prev => ({...prev, [currentTestIndex]: optionIndex}));
  };

  const submitExam = async (finalAnswers: Record<number, number>) => {
    const exam = exams.find(e => e.id === currentExamId);
    if (!exam) return;

    const correctCount = activeQuestions.reduce((acc, q, idx) => {
      return finalAnswers[idx] === q.answerIndex ? acc + 1 : acc;
    }, 0);

    const score = Math.round((correctCount / activeQuestions.length) * 100);
    setStudentScore(score);
    
    await addDoc(collection(db, 'results'), {
      examId: currentExamId, examTitle: exam.title, studentName, score,
      correctCount, totalCount: activeQuestions.length,
      answers: finalAnswers, activeQuestions, createdAt: Date.now(),
      mode: exam.mode
    });
    setView('student-result');
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      <nav className="p-4 bg-white border-b flex justify-between items-center sticky top-0 z-50 shadow-sm">
        <h1 onClick={() => setView('home')} className="text-blue-600 font-bold flex items-center gap-2 cursor-pointer">
          <span className="text-2xl">📋</span> 스마트 문제은행
        </h1>
      </nav>

      <main className="p-6 max-w-5xl mx-auto">
        {view === 'home' && (
          <div className="flex flex-col items-center gap-12 py-20 text-center">
            <h2 className="text-5xl font-black text-slate-800">Quiz Master</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full max-w-2xl">
              <button onClick={() => setView('admin-login')} className="p-10 bg-white border rounded-[2.5rem] shadow-sm hover:border-blue-500 transition-all flex flex-col items-center gap-4">
                <span className="text-6xl">👨‍🏫</span><span className="text-xl font-bold">선생님 / 관리자</span>
              </button>
              <div className="p-10 bg-white border rounded-[2.5rem] shadow-sm flex flex-col items-center gap-4">
                <span className="text-6xl">✅</span>
                <div className="flex gap-2 w-full">
                  <input value={currentExamId} onChange={e => setCurrentExamId(e.target.value)} placeholder="시험 코드 입력" className="border rounded-xl px-4 py-2 w-full text-sm outline-none"/>
                  <button onClick={() => currentExamId && setView('student-entry')} className="bg-green-600 text-white px-4 rounded-xl font-bold">입장</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {view === 'admin-login' && (
          <div className="max-w-md mx-auto py-20 text-center">
            <h2 className="text-2xl font-bold mb-8">관리자 인증</h2>
            <input type="password" value={adminPasswordInput} onChange={e => setAdminPasswordInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAdminLogin()} className="w-full border-2 rounded-2xl p-4 mb-4 text-center text-lg outline-none focus:border-blue-500" placeholder="비밀번호를 입력하세요"/>
            <button onClick={handleAdminLogin} className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold shadow-lg">접속</button>
          </div>
        )}

        {view === 'admin-dash' && (
          <div className="space-y-8">
            <div className="flex bg-white p-2 rounded-2xl border w-fit shadow-sm">
              <button onClick={() => setAdminTab('exams')} className={`px-6 py-2 rounded-xl font-bold transition-all ${adminTab === 'exams' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-50'}`}>시험 관리</button>
              <button onClick={() => setAdminTab('analytics')} className={`px-6 py-2 rounded-xl font-bold transition-all ${adminTab === 'analytics' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-50'}`}>통계 분석</button>
            </div>

            {adminTab === 'exams' ? (
              <div className="grid gap-4">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-2xl font-bold">시험 목록</h3>
                  <button onClick={() => {setEditingExamId(null); setView('admin-create');}} className="bg-blue-600 text-white px-5 py-2 rounded-xl font-bold">+ 새 시험</button>
                </div>
                {exams.map(exam => (
                  <div key={exam.id} className="bg-white p-6 rounded-[2rem] border flex justify-between items-center hover:shadow-md transition-all">
                    <div>
                      <h4 className="font-bold text-xl">{exam.title}</h4>
                      <p className="text-xs text-blue-500 font-mono">코드: {exam.id} | 모드: {exam.mode === 'test' ? '시험형' : '학습형'}</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => copyToClipboard(exam.id)} className="px-3 py-2 bg-blue-50 text-blue-600 rounded-xl font-bold text-sm">🔗 링크복사</button>
                      <button onClick={() => handleEditExam(exam)} className="p-2 text-slate-400">✏️</button>
                      <button onClick={async () => {if(window.confirm('삭제하시겠습니까?')) await deleteDoc(doc(db, 'exams', exam.id))}} className="p-2 text-red-400">🗑️</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-[2rem] border overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-xs font-bold border-b">
                    <tr>
                      <th className="px-6 py-4">응시자</th>
                      <th className="px-6 py-4">시험명</th>
                      <th className="px-6 py-4">점수</th>
                      <th className="px-6 py-4">일시</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y text-sm">
                    {results.map(r => (
                      <tr key={r.id}>
                        <td className="px-6 py-4 font-bold">{r.studentName}</td>
                        <td className="px-6 py-4">{r.examTitle} ({r.mode === 'test' ? '시험' : '학습'})</td>
                        <td className="px-6 py-4 text-blue-600 font-bold">{r.score}점</td>
                        <td className="px-6 py-4 text-slate-400">{new Date(r.createdAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {view === 'admin-create' && (
          <div className="space-y-8 pb-20">
            <div className="flex items-center gap-4">
              <button onClick={() => setView('admin-dash')} className="text-2xl p-2">⬅️</button>
              <input value={newExamTitle} onChange={e => setNewExamTitle(e.target.value)} className="text-3xl font-black outline-none bg-transparent flex-1" placeholder="시험 제목"/>
            </div>

            <div className="bg-white p-6 rounded-[2rem] border shadow-sm space-y-4">
              <span className="text-xs font-black text-slate-400 tracking-widest uppercase">🎯 응시 모드 설정</span>
              <div className="flex gap-4">
                <button onClick={() => setNewExamMode('study')} className={`flex-1 p-4 rounded-2xl border-2 font-bold transition-all ${newExamMode === 'study' ? 'border-blue-600 bg-blue-50 text-blue-600' : 'border-slate-100 text-slate-400'}`}>학습 모드 (소거형)</button>
                <button onClick={() => setNewExamMode('test')} className={`flex-1 p-4 rounded-2xl border-2 font-bold transition-all ${newExamMode === 'test' ? 'border-blue-600 bg-blue-50 text-blue-600' : 'border-slate-100 text-slate-400'}`}>시험 모드 (일괄 채점)</button>
              </div>
            </div>

            <div className="bg-white p-6 rounded-[2.5rem] border shadow-sm space-y-6">
              {newQuestions.map((q, i) => (
                <div key={i} className="space-y-4 p-6 border rounded-3xl relative">
                  <button onClick={() => setNewQuestions(newQuestions.filter((_, idx) => idx !== i))} className="absolute top-4 right-4 text-red-300">🗑️</button>
                  <textarea value={q.text} onChange={e => setNewQuestions(prev => prev.map((item, idx) => idx === i ? { ...item, text: e.target.value } : item))} className="w-full font-bold outline-none resize-none" placeholder="문제를 입력하세요"/>
                  <div className="grid grid-cols-2 gap-2">
                    {q.options.map((opt, oi) => (
                      <input key={oi} value={opt} onChange={e => setNewQuestions(prev => prev.map((item, idx) => idx === i ? { ...item, options: item.options.map((o, oIdx) => oIdx === oi ? e.target.value : o) } : item))} className={`p-3 rounded-xl border-2 ${q.answerIndex === oi ? 'border-blue-500 bg-blue-50' : 'border-slate-100'}`} placeholder={`보기 ${oi+1}`}/>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    {q.options.map((_, oi) => (
                      <button key={oi} onClick={() => setNewQuestions(prev => prev.map((item, idx) => idx === i ? { ...item, answerIndex: oi } : item))} className={`px-4 py-1 rounded-full text-xs font-bold ${q.answerIndex === oi ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>정답 {oi+1}</button>
                    ))}
                  </div>
                </div>
              ))}
              <button onClick={() => setNewQuestions([...newQuestions, {text:'', options:['','','',''], answerIndex:0, explanation: ''}])} className="w-full py-4 border-2 border-dashed rounded-3xl text-slate-300">+ 문항 추가</button>
            </div>
            <button onClick={handleSaveExam} className="w-full py-6 bg-slate-900 text-white rounded-[2.5rem] font-black text-xl shadow-2xl">시험 저장 및 출시</button>
          </div>
        )}

        {view === 'student-entry' && (
          <div className="max-w-md mx-auto py-20 text-center space-y-8">
            <h2 className="text-4xl font-black text-slate-800">{exams.find(e => e.id === currentExamId)?.title}</h2>
            <div className="space-y-4">
              <input value={studentName} onChange={e => setStudentName(e.target.value)} className="w-full border-4 border-slate-100 rounded-[2rem] p-6 text-center text-2xl font-black outline-none" placeholder="성함 입력"/>
              <button onClick={startExam} className="w-full bg-blue-600 text-white py-6 rounded-[2rem] font-black text-xl shadow-xl">시험 시작하기</button>
            </div>
          </div>
        )}

        {view === 'student-take' && (
          <div className="max-w-3xl mx-auto space-y-8 pb-32">
            <div className="bg-white p-6 rounded-[2rem] sticky top-20 border flex justify-between items-center shadow-xl z-10">
              <span className="font-bold text-slate-700">{studentName} 님</span>
              <span className="text-xs font-black px-4 py-2 bg-slate-900 text-white rounded-full">
                {exams.find(e=>e.id===currentExamId)?.mode === 'test' ? `${currentTestIndex + 1} / ${activeQuestions.length}` : `남은 문제: ${questionQueue.length}`}
              </span>
            </div>

            {exams.find(e => e.id === currentExamId)?.mode === 'test' ? (
              // 시험 모드 UI
              <div className="bg-white p-12 rounded-[3.5rem] border shadow-sm space-y-10">
                <h4 className="text-3xl font-black text-slate-800">Q{currentTestIndex + 1}. {activeQuestions[currentTestIndex].text}</h4>
                <div className="grid gap-4">
                  {activeQuestions[currentTestIndex].options.map((opt, oi) => (
                    <button key={oi} onClick={() => handleTestOptionClick(oi)} className={`text-left p-8 rounded-[2rem] border-2 font-bold text-lg transition-all ${testAnswers[currentTestIndex] === oi ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-50 hover:bg-slate-50 text-slate-500'}`}>
                      <span className={`inline-block w-8 h-8 rounded-lg text-center leading-8 mr-4 ${testAnswers[currentTestIndex] === oi ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-300'}`}>{oi+1}</span>{opt}
                    </button>
                  ))}
                </div>
                <div className="flex gap-4">
                  {currentTestIndex > 0 && <button onClick={() => setCurrentTestIndex(prev => prev - 1)} className="flex-1 py-4 bg-slate-100 rounded-2xl font-bold">이전</button>}
                  {currentTestIndex < activeQuestions.length - 1 ? 
                    <button onClick={() => setCurrentTestIndex(prev => prev + 1)} className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-bold shadow-lg" disabled={testAnswers[currentTestIndex] === undefined}>다음 문제</button> :
                    <button onClick={() => submitExam(testAnswers)} className="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-bold shadow-lg" disabled={testAnswers[currentTestIndex] === undefined}>최종 제출하기</button>
                  }
                </div>
              </div>
            ) : (
              // 학습 모드 UI
              <div className="bg-white p-12 rounded-[3.5rem] border shadow-sm space-y-10">
                <h4 className="text-3xl font-black text-slate-800">Q. {questionQueue[0]?.q.text}</h4>
                <div className="grid gap-4">
                  {questionQueue[0]?.q.options.map((opt, oi) => {
                    let btnStyle = 'border-slate-50 hover:bg-slate-50';
                    if (isAnswerChecked) {
                      if (oi === questionQueue[0].q.answerIndex) btnStyle = 'border-green-500 bg-green-50 text-green-700';
                      else if (oi === currentSelectedOption) btnStyle = 'border-red-500 bg-red-50 text-red-700';
                    }
                    return (
                      <button key={oi} onClick={() => handleStudyOptionClick(oi)} disabled={isAnswerChecked} className={`text-left p-8 rounded-[2rem] border-2 font-bold text-lg transition-all ${btnStyle}`}>
                        <span className="mr-4">{oi+1}.</span>{opt}
                      </button>
                    );
                  })}
                </div>
                {isAnswerChecked && (
                  <button onClick={handleStudyNext} className="w-full py-8 bg-blue-600 text-white rounded-[3rem] font-black text-2xl shadow-xl">
                    {questionQueue.length === 1 && currentSelectedOption === questionQueue[0].q.answerIndex ? '완료' : '다음 문제 👉'}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {view === 'student-result' && (
          <div className="max-w-2xl mx-auto py-20 text-center space-y-8">
            <h2 className="text-4xl font-black text-slate-800">수고하셨습니다!</h2>
            <div className="bg-white p-16 rounded-[4rem] shadow-2xl border-8 border-blue-50">
               <p className="text-slate-400 font-black text-lg mb-4">최종 점수</p>
               <div className="text-[10rem] font-black text-blue-600 leading-none">{studentScore}점</div>
            </div>
            <button onClick={() => setView('home')} className="bg-slate-900 text-white px-12 py-5 rounded-[2rem] font-black shadow-xl">메인으로</button>
          </div>
        )}
      </main>

      {toastMessage && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-slate-900/90 text-white px-10 py-5 rounded-full font-black z-[100] animate-bounce">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
