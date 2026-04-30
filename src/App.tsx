import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, type User } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, setDoc, getDoc } from 'firebase/firestore';
import emailjs from '@emailjs/browser'; // EmailJS 라이브러리 추가

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
  mode: 'study' | 'test';
  requireName: boolean;
  sendEmail: boolean;
  adminEmail?: string;
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
  const [testAnswers, setTestAnswers] = useState<Record<number, number>>({});

  // --- 관리자 상태 ---
  const [adminPasswordInput, setAdminPasswordInput] = useState(''); 
  const [editingExamId, setEditingExamId] = useState<string | null>(null);
  const [customExamId, setCustomExamId] = useState(''); 
  const [newExamTitle, setNewExamTitle] = useState('');
  const [newExamNotice, setNewExamNotice] = useState('');
  const [newExamMode, setNewExamMode] = useState<'study' | 'test'>('study');
  const [displayCount, setDisplayCount] = useState('');
  
  const [requireName, setRequireName] = useState(true);
  const [sendEmail, setSendEmail] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');

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
    setRequireName(exam.requireName !== false);
    setSendEmail(exam.sendEmail || false);
    setAdminEmail(exam.adminEmail || '');
    setNewQuestions(JSON.parse(JSON.stringify(exam.questions)));
    setDisplayCount(exam.displayCount?.toString() || '');
    setView('admin-create');
  };

  const handleCopyExam = (exam: Exam) => {
    setEditingExamId(null);
    setCustomExamId(exam.id + "-COPY");
    setNewExamTitle(exam.title + " (복사본)");
    setNewExamNotice(exam.notice || '');
    setNewExamMode(exam.mode || 'study');
    setRequireName(exam.requireName !== false);
    setSendEmail(exam.sendEmail || false);
    setAdminEmail(exam.adminEmail || '');
    setNewQuestions(JSON.parse(JSON.stringify(exam.questions)));
    setDisplayCount(exam.displayCount?.toString() || '');
    setView('admin-create');
    showToast('시험 내용이 복제되었습니다!');
  };

  const resetAdminForm = () => {
    setEditingExamId(null); setCustomExamId(''); setNewExamTitle(''); 
    setNewExamNotice(''); setNewExamMode('study'); setRequireName(true);
    setSendEmail(false); setAdminEmail(''); setDisplayCount('');
    setNewQuestions([{ text: '', options: ['', '', '', ''], answerIndex: 0, explanation: '' }]); 
  };

  const handleSaveExam = async () => {
    if (!newExamTitle.trim()) return showToast('제목을 입력해주세요.');
    if (sendEmail && !adminEmail.trim()) return showToast('결과를 수신할 이메일 주소를 입력해주세요.');
    
    let finalId = customExamId.trim().replace(/\s+/g, '-'); 
    if (!finalId) {
        if (editingExamId) finalId = editingExamId;
        else finalId = Math.random().toString(36).substring(2, 8).toUpperCase();
    }

    const dCount = parseInt(displayCount) || newQuestions.length;
    const cleanedQuestions = newQuestions.map(q => ({...q, explanation: q.explanation || ''}));

    const examData = { 
      title: newExamTitle, 
      notice: newExamNotice,
      mode: newExamMode,
      requireName,
      sendEmail,
      adminEmail: sendEmail ? adminEmail : '',
      questions: cleanedQuestions, 
      displayCount: dCount, 
      createdAt: Date.now() 
    };

    try {
      if (editingExamId) {
          if (editingExamId === finalId) {
              await updateDoc(doc(db, 'exams', editingExamId), examData);
          } else {
              const docSnap = await getDoc(doc(db, 'exams', finalId));
              if (docSnap.exists()) return showToast('이미 사용 중인 시험 코드입니다.');
              await setDoc(doc(db, 'exams', finalId), examData);
              await deleteDoc(doc(db, 'exams', editingExamId));
          }
      } else {
          const docSnap = await getDoc(doc(db, 'exams', finalId));
          if (docSnap.exists()) return showToast('이미 사용 중인 시험 코드입니다.');
          await setDoc(doc(db, 'exams', finalId), examData);
      }
      setView('admin-dash'); showToast('저장되었습니다.');
      resetAdminForm();
    } catch (e) { showToast('저장 실패'); }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result as string;
      const parseCSV = (text: string) => {
        const rows = [];
        const lines = text.split(/\r?\n/);
        for (let line of lines) {
          if (!line.trim()) continue;
          const cols = [];
          let cur = '';
          let inQuotes = false;
          for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') inQuotes = !inQuotes;
            else if (char === ',' && !inQuotes) {
              cols.push(cur.replace(/^"|"$/g, '').trim());
              cur = '';
            } else cur += char;
          }
          cols.push(cur.replace(/^"|"$/g, '').trim());
          rows.push(cols);
        }
        return rows;
      };
      const allRows = parseCSV(content);
      const parsedFromFile: Question[] = allRows.map(cols => ({
        text: cols[0], 
        options: [cols[1], cols[2], cols[3], cols[4]], 
        answerIndex: parseInt(cols[5]) - 1,
        explanation: cols[6] || ''
      })).filter(q => q.text && q.options.length >= 4 && !isNaN(q.answerIndex));
      
      if (parsedFromFile.length > 0) { 
        const existingNotEmpty = newQuestions.filter(q => q.text.trim() !== '');
        setNewQuestions([...existingNotEmpty, ...parsedFromFile]); 
        showToast(`${parsedFromFile.length}문제가 추가되었습니다!`); 
      }
    };
    reader.readAsText(file);
    e.target.value = ''; 
  };

  const startExam = () => {
    const exam = exams.find(e => e.id === currentExamId);
    if (!exam) return showToast('시험 코드를 확인하세요.');

    if (exam.requireName && !studentName.trim()) {
      return showToast('이름을 필수로 입력하셔야 합니다.');
    }
    
    if (!exam.requireName && !studentName.trim()) {
      setStudentName('익명 응시자');
    }
    
    const pool = [...exam.questions];
    const finalCount = parseInt(exam.displayCount?.toString() || pool.length.toString());
    const selectedQuestions = pool.sort(() => Math.random() - 0.5).slice(0, finalCount);
    
    setActiveQuestions(selectedQuestions);
    setFirstAttemptAnswers({});
    
    if (exam.mode === 'test') {
      setTestAnswers({});
    } else {
      setQuestionQueue(selectedQuestions.map((q, idx) => ({q, originalIndex: idx})));
      setIsAnswerChecked(false);
      setCurrentSelectedOption(null);
    }
    
    setView('student-take');
  };

  const handleStudyOptionClick = (optionIndex: number) => {
    if (isAnswerChecked || questionQueue.length === 0) return;
    const currentItem = questionQueue[0];
    setCurrentSelectedOption(optionIndex);
    setIsAnswerChecked(true);

    setFirstAttemptAnswers(prev => {
        if (prev[currentItem.originalIndex] === undefined) {
            return {...prev, [currentItem.originalIndex]: optionIndex};
        }
        return prev;
    });
  };

  const handleStudyNextQuestion = () => {
    if (questionQueue.length === 0) return;
    const currentItem = questionQueue[0];
    const isCorrect = currentSelectedOption === currentItem.q.answerIndex;
    let nextQueue = [...questionQueue];
    const shiftedItem = nextQueue.shift();

    if (!isCorrect && shiftedItem) {
        nextQueue.push(shiftedItem);
    }

    setQuestionQueue(nextQueue);
    setIsAnswerChecked(false);
    setCurrentSelectedOption(null);

    if (nextQueue.length === 0) {
        submitExam(firstAttemptAnswers);
    }
  };

  const handleTestOptionClick = (questionIndex: number, optionIndex: number) => {
    setTestAnswers(prev => ({
      ...prev,
      [questionIndex]: optionIndex
    }));
  };

  const handleTestSubmit = () => {
    if (Object.keys(testAnswers).length < activeQuestions.length) {
      if (!window.confirm('아직 풀지 않은 문제가 있습니다. 제출하시겠습니까?')) return;
    }
    submitExam(testAnswers);
  };

  const submitExam = async (finalAnswers: Record<number, number>) => {
    const exam = exams.find(e => e.id === currentExamId);
    if (!exam) return;

    const correctCount = activeQuestions.reduce((count, q, idx) => {
        if (finalAnswers[idx] === q.answerIndex) return count + 1;
        return count;
    }, 0);

    const score = Math.round((correctCount / activeQuestions.length) * 100);
    setStudentScore(score);
    const finalName = studentName.trim() || '익명 응시자';
    
    await addDoc(collection(db, 'results'), {
      examId: currentExamId, 
      examTitle: exam.title, 
      studentName: finalName, 
      score,
      correctCount: correctCount, 
      totalCount: activeQuestions.length,
      answers: finalAnswers, 
      activeQuestions, 
      createdAt: Date.now(),
      mode: exam.mode || 'study'
    });

    // --- 실제 EmailJS 발송 부분 ---
    if (exam.sendEmail && exam.adminEmail) {
      const templateParams = {
        to_email: exam.adminEmail, // 템플릿의 {{to_email}}
        exam_title: exam.title,    // 템플릿의 {{exam_title}}
        student_name: finalName,   // 템플릿의 {{student_name}}
        score: score,              // 템플릿의 {{score}}
      };

      emailjs.send(
        'service_tteoghd',        // 전달해주신 서비스 ID
        'template_2m8pjfh',       // 전달해주신 템플릿 ID
        templateParams,
        'DWRlrJcaehbtyenom'       // 전달해주신 퍼블릭 키
      )
      .then((response) => {
        console.log('이메일 발송 성공!', response.status, response.text);
      })
      .catch((error) => {
        console.error('이메일 발송 실패...', error);
      });
    }
    
    setView('student-result');
  };

  const getQuestionStats = () => {
    const stats: Record<string, { total: number, wrong: number }> = {};
    results.forEach(res => {
      if (!res.activeQuestions) return; 
      res.activeQuestions.forEach((q, idx) => {
        if (!stats[q.text]) stats[q.text] = { total: 0, wrong: 0 };
        stats[q.text].total += 1;
        if (res.answers[idx] !== q.answerIndex) stats[q.text].wrong += 1;
      });
    });
    return Object.entries(stats)
      .map(([text, s]) => ({ text, rate: Math.round((s.wrong / s.total) * 100), count: s.wrong }))
      .sort((a, b) => b.rate - a.rate);
  };

  const exportToCSV = () => {
    const headers = ["시험명", "모드", "이름", "점수", "제출일시"];
    const rows = results.map(r => [
      r.examTitle, r.mode === 'test' ? '시험형' : '학습형', r.studentName, r.score, new Date(r.createdAt).toLocaleString()
    ]);
    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "응시결과리스트.csv";
    link.click();
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
              <button onClick={() => setAdminTab('analytics')} className={`px-6 py-2 rounded-xl font-bold transition-all ${adminTab === 'analytics' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-50'}`}>교육 통계 분석</button>
            </div>

            {adminTab === 'exams' ? (
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <h3 className="text-2xl font-bold">시험 목록</h3>
                  <button onClick={() => {resetAdminForm(); setView('admin-create');}} className="bg-blue-600 text-white px-5 py-2.5 rounded-xl font-bold"><span>➕</span> 새 시험</button>
                </div>
                <div className="grid gap-4">
                  {exams.map(exam => (
                    <div key={exam.id} className="bg-white p-6 rounded-[2rem] border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:shadow-md transition-all">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-bold text-xl">{exam.title}</h4>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${exam.mode === 'test' ? 'bg-purple-100 text-purple-600' : 'bg-emerald-100 text-emerald-600'}`}>
                            {exam.mode === 'test' ? '일제 평가형' : '학습 소거형'}
                          </span>
                        </div>
                        <p className="text-xs text-blue-500 font-mono mb-1">코드: {exam.id}</p>
                        <p className="text-xs text-slate-400">문항: {exam.questions.length}개 / 설정: {exam.requireName ? '실명필수' : '익명가능'} {exam.sendEmail ? '📧메일수신' : ''}</p>
                      </div>
                      <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                        <button onClick={() => copyToClipboard(exam.id)} className="px-3 py-2 bg-blue-50 text-blue-600 rounded-xl font-bold text-sm">🔗 링크복사</button>
                        <button onClick={() => handleCopyExam(exam)} className="p-2 text-blue-400 hover:bg-blue-50 rounded-xl transition-colors">📋</button>
                        <button onClick={() => handleEditExam(exam)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-xl transition-colors">✏️</button>
                        <button onClick={async () => {if(window.confirm('삭제하시겠습니까?')) await deleteDoc(doc(db, 'exams', exam.id))}} className="p-2 text-red-400 hover:bg-red-50 rounded-xl">🗑️</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6">
                  <div className="flex justify-between items-center">
                    <h3 className="text-2xl font-bold">응시자 현황</h3>
                    <button onClick={exportToCSV} className="text-sm font-bold text-blue-600 px-4 py-2 bg-blue-50 rounded-xl">📊 엑셀 다운로드</button>
                  </div>
                  <div className="bg-white rounded-[2rem] border overflow-hidden shadow-sm">
                    <table className="w-full text-left">
                      <thead className="bg-slate-50 text-slate-400 text-xs uppercase font-bold border-b">
                        <tr>
                          <th className="px-6 py-4">응시자</th>
                          <th className="px-6 py-4">시험명</th>
                          <th className="px-6 py-4">점수</th>
                          <th className="px-6 py-4 text-right">일시</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {results.map(r => (
                          <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-6 py-4 font-bold">
                              <div className="flex items-center gap-2">
                                {r.studentName}
                                <button onClick={async () => {if(window.confirm('기록을 삭제하시겠습니까?')) await deleteDoc(doc(db, 'results', r.id))}} className="text-red-300 hover:text-red-500 text-[10px]">삭제</button>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-sm text-slate-500">
                              {r.examTitle}
                              <span className="block text-[10px] text-slate-400 mt-1">{r.mode === 'test' ? '일제 평가형' : '학습 소거형'}</span>
                            </td>
                            <td className="px-6 py-4 font-bold text-blue-600">{r.score}점</td>
                            <td className="px-6 py-4 text-right text-xs text-slate-400">{new Date(r.createdAt).toLocaleDateString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="space-y-6 text-2xl font-bold">오답 TOP 5
                   <div className="bg-white p-6 rounded-[2rem] border shadow-sm space-y-4">
                    {getQuestionStats().slice(0, 5).map((stat, idx) => (
                      <div key={idx} className="space-y-2">
                        <div className="flex justify-between items-start gap-4">
                          <p className="text-sm font-bold text-slate-700 line-clamp-2">{stat.text}</p>
                          <span className="text-red-500 font-black text-xs shrink-0">{stat.rate}%</span>
                        </div>
                        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-red-400 transition-all" style={{ width: `${stat.rate}%` }}></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {view === 'admin-create' && (
          <div className="space-y-8 pb-20">
            <div className="flex items-center gap-4">
              <button onClick={() => setView('admin-dash')} className="text-2xl hover:bg-white p-2 rounded-full">⬅️</button>
              <div className="flex-1 flex flex-col gap-1">
                 <input value={newExamTitle} onChange={e => setNewExamTitle(e.target.value)} className="text-3xl font-black outline-none bg-transparent border-b-2 border-transparent focus:border-blue-500 transition-all" placeholder="시험 제목"/>
                 <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs font-bold text-slate-400">시험 코드(ID):</span>
                    <input value={customExamId} onChange={e => setCustomExamId(e.target.value)} className="text-xs font-mono bg-blue-50 text-blue-600 px-2 py-1 rounded outline-none border border-blue-100 w-fit" placeholder="미입력시 자동생성"/>
                 </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white p-6 rounded-[2rem] border shadow-sm space-y-4">
                <span className="text-xs font-black text-slate-400 tracking-widest uppercase">🎯 응시 방식 선택</span>
                <div className="grid grid-cols-1 gap-3">
                  <div onClick={() => setNewExamMode('study')} className={`cursor-pointer p-4 rounded-xl border-2 transition-all flex items-center gap-3 ${newExamMode === 'study' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-100 hover:border-slate-200'}`}>
                    <span className="text-2xl">🔁</span>
                    <div>
                      <h5 className={`font-bold text-sm ${newExamMode === 'study' ? 'text-emerald-700' : 'text-slate-700'}`}>학습형 (단어장/소거형)</h5>
                      <p className="text-[10px] text-slate-500 mt-1">틀린 문제는 맞출 때까지 반복 출제됩니다.</p>
                    </div>
                  </div>
                  <div onClick={() => setNewExamMode('test')} className={`cursor-pointer p-4 rounded-xl border-2 transition-all flex items-center gap-3 ${newExamMode === 'test' ? 'border-purple-500 bg-purple-50' : 'border-slate-100 hover:border-slate-200'}`}>
                    <span className="text-2xl">📝</span>
                    <div>
                      <h5 className={`font-bold text-sm ${newExamMode === 'test' ? 'text-purple-700' : 'text-slate-700'}`}>평가형 (일제 시험형)</h5>
                      <p className="text-[10px] text-slate-500 mt-1">한 번에 전체를 풀고 제출하여 평가합니다.</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-[2rem] border shadow-sm space-y-6">
                <span className="text-xs font-black text-slate-400 tracking-widest uppercase">⚙️ 추가 설정</span>
                
                <div className="space-y-4">
                  <label className="flex items-center justify-between cursor-pointer">
                    <div>
                      <h5 className="font-bold text-sm text-slate-700">실명 입력 강제</h5>
                      <p className="text-[10px] text-slate-500">끄면 이름을 입력하지 않아도 '익명'으로 시험을 볼 수 있습니다.</p>
                    </div>
                    <div className={`w-12 h-6 rounded-full relative transition-colors ${requireName ? 'bg-blue-600' : 'bg-slate-200'}`} onClick={() => setRequireName(!requireName)}>
                      <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${requireName ? 'translate-x-7' : 'translate-x-1'}`}></div>
                    </div>
                  </label>

                  <div className="border-t pt-4">
                    <label className="flex items-center justify-between cursor-pointer mb-3">
                      <div>
                        <h5 className="font-bold text-sm text-slate-700">결과 이메일 수신</h5>
                        <p className="text-[10px] text-slate-500">학생이 시험을 완료하면 등록된 이메일로 알림을 받습니다.</p>
                      </div>
                      <div className={`w-12 h-6 rounded-full relative transition-colors ${sendEmail ? 'bg-blue-600' : 'bg-slate-200'}`} onClick={() => setSendEmail(!sendEmail)}>
                        <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${sendEmail ? 'translate-x-7' : 'translate-x-1'}`}></div>
                      </div>
                    </label>
                    {sendEmail && (
                      <input 
                        type="email" 
                        value={adminEmail} 
                        onChange={e => setAdminEmail(e.target.value)} 
                        placeholder="결과를 수신할 이메일 주소 입력" 
                        className="w-full p-3 border rounded-xl text-sm outline-none focus:border-blue-500"
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-[2rem] border shadow-sm space-y-4">
              <span className="text-xs font-black text-slate-400 tracking-widest uppercase">📌 선생님 공지사항</span>
              <textarea value={newExamNotice} onChange={e => setNewExamNotice(e.target.value)} className="w-full p-4 bg-slate-50 border rounded-2xl text-sm outline-none focus:ring-2 ring-blue-100 h-24 resize-none" placeholder="시험 시작 전 응시자에게 보여줄 공지사항을 입력하세요"/>
            </div>
            
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-white p-6 rounded-[2.5rem] border shadow-sm">
              <div className="flex items-center gap-4 text-sm font-bold text-blue-700">
                <span>🔀</span> 랜덤 출제 문항 수: 
                <input type="number" value={displayCount} onChange={e => setDisplayCount(e.target.value)} className="w-20 p-2 rounded-xl border bg-slate-50 text-center outline-none" placeholder="전체"/>
              </div>
              <label className="w-full sm:w-auto bg-green-600 text-white px-8 py-4 rounded-2xl flex items-center justify-center gap-2 text-sm font-bold cursor-pointer hover:bg-green-700 transition-all shadow-md">
                <span>📊</span> CSV 문제 추가하기<input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
              </label>
            </div>
            
            <div className="space-y-6">
              {newQuestions.map((q, i) => (
                <div key={i} className="bg-white p-10 rounded-[3rem] border shadow-sm space-y-6 relative group">
                  <button onClick={() => setNewQuestions(newQuestions.filter((_, idx) => idx !== i))} className="absolute top-8 right-8 text-slate-300 hover:text-red-500 transition-colors">🗑️</button>
                  <div className="space-y-2">
                    <span className="text-xs font-black text-blue-300 uppercase tracking-widest">Question {i+1}</span>
                    <textarea value={q.text} onChange={e => setNewQuestions(prev => prev.map((item, idx) => idx === i ? { ...item, text: e.target.value } : item))} className="w-full text-xl font-bold outline-none resize-none bg-transparent" placeholder="문제 내용" rows={2}/>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {q.options.map((opt, oi) => (
                      <div key={oi} className="relative">
                        <input value={opt} onChange={e => setNewQuestions(prev => prev.map((item, idx) => idx === i ? { ...item, options: item.options.map((o, oIdx) => oIdx === oi ? e.target.value : o) } : item))} className={`w-full p-4 pl-12 rounded-2xl border-2 outline-none transition-all ${q.answerIndex === oi ? 'border-blue-600 bg-blue-50/50' : 'border-slate-50 bg-slate-50 focus:border-slate-200'}`} placeholder={`보기 ${oi+1}`}/>
                        <button onClick={() => setNewQuestions(prev => prev.map((item, iIdx) => iIdx === i ? { ...item, answerIndex: oi } : item))} className={`absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full border-2 font-black text-[10px] flex items-center justify-center ${q.answerIndex === oi ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300 text-slate-300'}`}>{oi+1}</button>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 border-t pt-4">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">💡 해설 (선택)</span>
                    <textarea value={q.explanation || ''} onChange={e => setNewQuestions(prev => prev.map((item, idx) => idx === i ? { ...item, explanation: e.target.value } : item))} className="w-full mt-2 p-3 bg-slate-50 border rounded-xl text-sm outline-none focus:border-blue-300 resize-none" placeholder="오답 시 학생에게 보여줄 해설을 입력하세요" rows={2}/>
                  </div>
                </div>
              ))}
              <button onClick={() => setNewQuestions([...newQuestions, {text:'', options:['','','',''], answerIndex:0, explanation: ''}])} className="w-full py-10 bg-white border-4 border-dashed border-slate-100 rounded-[3rem] text-slate-300 font-black text-lg hover:border-blue-100 transition-all">+ 직접 문항 추가하기</button>
            </div>
            <button onClick={handleSaveExam} className="w-full py-6 bg-slate-900 text-white rounded-[2.5rem] font-black text-xl sticky bottom-4 shadow-2xl active:scale-95 transition-transform">설정 저장하고 출시하기</button>
          </div>
        )}

        {view === 'student-entry' && (
          <div className="max-w-md mx-auto py-10 space-y-10">
            <div className="text-center space-y-4">
                <div className="text-8xl animate-bounce">🏆</div>
                <h2 className="text-4xl font-black text-slate-800">{exams.find(e => e.id === currentExamId)?.title}</h2>
            </div>
            
            {exams.find(e => e.id === currentExamId)?.notice && (
              <div className="bg-blue-50 p-8 rounded-[2.5rem] border border-blue-100 space-y-3 relative overflow-hidden shadow-inner">
                <div className="absolute top-0 left-0 w-1 h-full bg-blue-400"></div>
                <h4 className="text-xs font-black text-blue-600 tracking-widest uppercase flex items-center gap-2">📢 선생님 공지사항</h4>
                <p className="text-slate-600 font-medium leading-relaxed whitespace-pre-wrap italic">
                  "{exams.find(e => e.id === currentExamId)?.notice}"
                </p>
              </div>
            )}

            <div className="space-y-4">
              <input 
                value={studentName} 
                onChange={e => setStudentName(e.target.value)} 
                className="w-full border-4 border-slate-100 rounded-[2rem] p-6 text-center text-2xl font-black outline-none focus:border-blue-500 transition-all shadow-sm" 
                placeholder={exams.find(e => e.id === currentExamId)?.requireName ? "성함 입력 (필수)" : "성함 입력 (선택: 미입력시 익명)"}
              />
              <button onClick={startExam} className="w-full bg-blue-600 text-white py-6 rounded-[2rem] font-black text-xl shadow-xl hover:bg-blue-700 transition-all active:scale-95">시험 시작하기</button>
            </div>
          </div>
        )}

        {view === 'student-take' && exams.find(e => e.id === currentExamId)?.mode === 'test' && activeQuestions.length > 0 && (
          <div className="max-w-3xl mx-auto space-y-8 pb-32">
            <div className="bg-white/90 backdrop-blur-md p-6 rounded-[2rem] sticky top-20 border flex justify-between items-center shadow-xl z-10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-600 rounded-full flex items-center justify-center text-white font-black">{studentName ? studentName[0] : '익'}</div>
                <span className="font-bold text-slate-700">{studentName || '익명 응시자'} 님 평가 중</span>
              </div>
              <span className="text-xs font-black px-5 py-2.5 bg-slate-900 text-white rounded-full tracking-widest">
                마킹 완료: {Object.keys(testAnswers).length} / {activeQuestions.length}
              </span>
            </div>

            <div className="space-y-6">
              {activeQuestions.map((q, qIndex) => (
                <div key={qIndex} className="bg-white p-10 rounded-[3rem] border shadow-sm space-y-8">
                  <h4 className="text-2xl font-black text-slate-800 flex gap-4">
                    <span className="text-purple-300 italic">Q{qIndex + 1}.</span>{q.text}
                  </h4>
                  <div className="grid gap-3">
                    {q.options.map((opt, oi) => {
                      const isSelected = testAnswers[qIndex] === oi;
                      return (
                        <button 
                          key={oi} 
                          onClick={() => handleTestOptionClick(qIndex, oi)} 
                          className={`text-left p-6 rounded-2xl border-2 font-bold transition-all ${isSelected ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-slate-50 hover:bg-slate-50 text-slate-600'}`}
                        >
                          <span className={`inline-block w-8 h-8 rounded-lg text-center leading-8 mr-4 ${isSelected ? 'bg-purple-500 text-white' : 'bg-slate-100 text-slate-400'}`}>{oi+1}</span>
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <button 
              onClick={handleTestSubmit} 
              className={`w-full py-8 text-white rounded-[3rem] font-black text-2xl shadow-xl transition-all ${Object.keys(testAnswers).length === activeQuestions.length ? 'bg-purple-600 hover:bg-purple-700' : 'bg-slate-300'}`}
            >
              전체 답안 제출하기
            </button>
          </div>
        )}

        {view === 'student-take' && exams.find(e => e.id === currentExamId)?.mode !== 'test' && questionQueue.length > 0 && (
          <div className="max-w-3xl mx-auto space-y-8 pb-32">
            <div className="bg-white/90 backdrop-blur-md p-6 rounded-[2rem] sticky top-20 border flex justify-between items-center shadow-xl z-10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-600 rounded-full flex items-center justify-center text-white font-black">{studentName ? studentName[0] : '익'}</div>
                <span className="font-bold text-slate-700">{studentName || '익명 응시자'} 님 학습 중</span>
              </div>
              <span className="text-xs font-black px-5 py-2.5 bg-slate-900 text-white rounded-full tracking-widest">
                진행률: {activeQuestions.length - questionQueue.length + (isAnswerChecked && currentSelectedOption === questionQueue[0].q.answerIndex ? 1 : 0)} / {activeQuestions.length}
              </span>
            </div>
            
            <div className="bg-white p-12 rounded-[3.5rem] border shadow-sm space-y-10">
                <div className="flex justify-between items-start">
                    <h4 className="text-3xl font-black text-slate-800 flex gap-4"><span className="text-emerald-100 italic">Q.</span>{questionQueue[0].q.text}</h4>
                    {firstAttemptAnswers[questionQueue[0].originalIndex] !== undefined && firstAttemptAnswers[questionQueue[0].originalIndex] !== questionQueue[0].q.answerIndex && (
                        <span className="bg-red-100 text-red-600 text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap">🔄 재도전</span>
                    )}
                </div>

                <div className="grid gap-4">
                  {questionQueue[0].q.options.map((opt, oi) => {
                    let btnStyle = 'border-slate-50 hover:bg-slate-50 text-slate-500';
                    let numStyle = 'bg-slate-100 text-slate-300';
                    
                    if (isAnswerChecked) {
                        if (oi === questionQueue[0].q.answerIndex) {
                            btnStyle = 'border-emerald-500 bg-emerald-50 text-emerald-700 shadow-inner translate-x-2';
                            numStyle = 'bg-emerald-500 text-white';
                        } else if (oi === currentSelectedOption) {
                            btnStyle = 'border-red-500 bg-red-50 text-red-700';
                            numStyle = 'bg-red-500 text-white';
                        }
                    }

                    return (
                        <button 
                            key={oi} 
                            onClick={() => handleStudyOptionClick(oi)} 
                            disabled={isAnswerChecked}
                            className={`text-left p-8 rounded-[2rem] border-2 font-bold text-lg transition-all ${btnStyle}`}
                        >
                            <span className={`inline-block w-8 h-8 rounded-lg text-center leading-8 mr-4 ${numStyle}`}>{oi+1}</span>{opt}
                        </button>
                    );
                  })}
                </div>

                {isAnswerChecked && (
                    <div className={`mt-8 p-6 rounded-3xl border-2 animate-fade-in-up ${currentSelectedOption === questionQueue[0].q.answerIndex ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                        <h5 className={`font-black text-xl mb-2 ${currentSelectedOption === questionQueue[0].q.answerIndex ? 'text-emerald-700' : 'text-red-700'}`}>
                            {currentSelectedOption === questionQueue[0].q.answerIndex ? '🎉 정답입니다!' : '❌ 틀렸습니다.'}
                        </h5>
                        {questionQueue[0].q.explanation && (
                            <p className="text-slate-700 whitespace-pre-wrap mt-4 leading-relaxed">
                                <span className="font-bold text-sm block mb-1 opacity-50">💡 해설</span>
                                {questionQueue[0].q.explanation}
                            </p>
                        )}
                        {!currentSelectedOption || currentSelectedOption !== questionQueue[0].q.answerIndex ? (
                            <p className="text-red-500 font-bold mt-4 text-sm">※ 이 문제는 나중에 다시 출제됩니다.</p>
                        ) : null}
                    </div>
                )}
            </div>

            {isAnswerChecked && (
                <button onClick={handleStudyNextQuestion} className="w-full py-8 bg-emerald-600 hover:bg-emerald-700 text-white rounded-[3rem] font-black text-2xl shadow-xl active:scale-95 transition-all animate-fade-in-up">
                    {questionQueue.length === 1 && currentSelectedOption === questionQueue[0].q.answerIndex ? '학습 완료하기' : '다음 문제로 넘어가기 👉'}
                </button>
            )}
          </div>
        )}

        {view === 'student-result' && (
          <div className="max-w-2xl mx-auto py-20 text-center space-y-8">
            <div className="text-9xl mb-4 animate-pulse">🎉</div>
            <h2 className="text-4xl font-black text-slate-800">
              {exams.find(e => e.id === currentExamId)?.mode === 'test' ? '평가가 종료되었습니다!' : '모든 문제를 마스터했습니다!'}
            </h2>
            <div className="bg-white p-16 rounded-[4rem] shadow-2xl border-8 border-blue-50 relative overflow-hidden">
               <div className="absolute top-0 left-0 w-full h-2 bg-blue-600"></div>
               <p className="text-slate-400 font-black text-lg mb-4 uppercase tracking-widest">최종 점수 (첫 시도 기준)</p>
               <div className="text-[12rem] font-black text-blue-600 leading-none">{studentScore}<span className="text-4xl text-slate-200 ml-4 font-normal">pts</span></div>
            </div>
            
            <button onClick={() => {setStudentName(''); setView('home'); window.history.replaceState({}, '', window.location.pathname);}} className="bg-slate-900 text-white px-12 py-5 rounded-[2rem] font-black hover:bg-slate-800 transition-all mt-10 shadow-xl">메인으로 돌아가기</button>
          </div>
        )}
      </main>

      {toastMessage && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-slate-900/90 backdrop-blur-md text-white px-10 py-5 rounded-full font-black z-[100] shadow-2xl animate-bounce tracking-tight">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
