import React, { useState, useEffect } from 'react';
import { 
  ClipboardList, 
  Users, 
  Plus, 
  Copy, 
  ArrowLeft, 
  CheckCircle, 
  Trash2, 
  Trophy,
  AlertCircle,
  FileSpreadsheet,
  Shuffle,
  Edit,
  Download,
  BarChart2,
  Loader2
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, User } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';

// --- 데이터 타입 정의 ---
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
  answers: { [key: number]: number };
  createdAt: number;
}

// --- Firebase 설정 ---
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
  // Tailwind CSS 동적 로드
  useEffect(() => {
    if (!document.getElementById('tailwind-cdn')) {
      const script = document.createElement('script');
      script.id = 'tailwind-cdn';
      script.src = "https://cdn.tailwindcss.com";
      document.head.appendChild(script);
    }
  }, []);

  const ADMIN_SECRET = '2026'; 

  // --- 상태 관리 ---
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
  const [studentAnswers, setStudentAnswers] = useState<{ [key: number]: number }>({});
  const [studentScore, setStudentScore] = useState(0);

  // --- Firebase 초기화 ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (err) {
        console.error("Auth error:", err);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsubscribe();
  }, []);

  // URL 파라미터 확인
  useEffect(() => {
    const queryParams = new URLSearchParams(window.location.search);
    const examParam = queryParams.get('exam');
    if (examParam) {
      setCurrentExamId(examParam);
      setView('student-entry');
    }
  }, []);

  // 데이터 실시간 동기화
  useEffect(() => {
    if (!user) return;
    const unsubExams = onSnapshot(collection(db, 'exams'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Exam));
      setExams(data.sort((a, b) => b.createdAt - a.createdAt));
      setIsLoading(false);
    }, (error) => {
      console.error("Exams fetch error:", error);
      setIsLoading(false);
    });

    const unsubResults = onSnapshot(collection(db, 'results'), (snapshot) => {
      setResults(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ExamResult)));
    }, (error) => {
      console.error("Results fetch error:", error);
    });

    return () => { unsubExams(); unsubResults(); };
  }, [user]);

  // --- 공통 기능 ---
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleCopyLink = (examId: string) => {
    const url = `${window.location.origin}${window.location.pathname}?exam=${examId}`;
    const t = document.createElement("textarea");
    t.value = url; document.body.appendChild(t);
    t.select(); document.execCommand('copy');
    document.body.removeChild(t);
    showToast('링크가 복사되었습니다!');
  };

  const handleAdminLogin = () => {
    if (adminPasswordInput === ADMIN_SECRET) {
      setView('admin-dash');
      setAdminPasswordInput(''); 
    } else {
      showToast('비밀번호가 틀렸습니다.');
    }
  };

  const handleSaveExam = async () => {
    if (!newExamTitle.trim()) return showToast('제목을 입력하세요.');
    const count = parseInt(displayCount) || newQuestions.length;
    const data = { title: newExamTitle, questions: newQuestions, displayCount: count, createdAt: Date.now() };
    try {
      if (editingExamId) {
        await updateDoc(doc(db, 'exams', editingExamId), data);
        showToast('수정되었습니다.');
      } else {
        await addDoc(collection(db, 'exams'), data);
        showToast('생성되었습니다.');
      }
      setView('admin-dash');
      setEditingExamId(null);
      setNewExamTitle(''); setDisplayCount('');
      setNewQuestions([{ text: '', options: ['', '', '', ''], answerIndex: 0 }]);
    } catch (e) { 
      console.error(e);
      showToast('저장 중 오류가 발생했습니다.'); 
    }
  };

  const startExam = () => {
    const exam = exams.find(e => e.id === currentExamId);
    if (!studentName.trim() || !exam) return;
    let pool = (exam.questions || []).map((q, i) => ({ ...q, originalIndex: i }));
    pool.sort(() => Math.random() - 0.5);
    setActiveQuestions(pool.slice(0, exam.displayCount || pool.length));
    setStudentAnswers({});
    setView('student-take');
  };

  const submitExam = async () => {
    const exam = exams.find(e => e.id === currentExamId);
    if (!exam || activeQuestions.length === 0) return;
    let corrects = 0;
    activeQuestions.forEach(q => {
      if (studentAnswers[q.originalIndex!] === q.answerIndex) corrects++;
    });
    const score = Math.round((corrects / activeQuestions.length) * 100);
    setStudentScore(score);
    try {
      await addDoc(collection(db, 'results'), {
        examId: currentExamId, examTitle: exam.title, studentName, score,
        correctCount: corrects, totalCount: activeQuestions.length,
        answers: studentAnswers, createdAt: Date.now()
      });
      setView('student-result');
    } catch (err) {
      showToast('결과 저장에 실패했습니다.');
    }
  };

  // --- 화면 렌더링 파트 ---
  if (isLoading && view === 'home') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
        <Loader2 className="animate-spin text-blue-600 mb-4" size={48} />
        <p className="text-gray-500 font-bold">서버에 연결 중입니다...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
      <header className="bg-white border-b px-6 py-4 flex justify-between items-center sticky top-0 z-50 shadow-sm">
        <div className="text-xl font-bold text-blue-600 flex items-center gap-2 cursor-pointer" onClick={() => setView('home')}>
          <ClipboardList /> QuizMaster
        </div>
        <div className="text-sm font-medium text-gray-400 flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${user ? 'bg-green-500' : 'bg-gray-300'}`} />
          {user ? '실시간 연결됨' : '연결 확인 중'}
        </div>
      </header>

      <main className="p-4 max-w-5xl mx-auto">
        {/* 메인 홈 */}
        {view === 'home' && (
          <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in duration-700">
            <h2 className="text-4xl sm:text-5xl font-black mb-6 tracking-tight">스마트 문제은행</h2>
            <p className="text-gray-500 mb-12 text-lg">언제 어디서나 간편하게 시험을 치르고 관리하세요.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full max-w-2xl">
              <button onClick={() => setView('admin-login')} className="bg-white p-10 rounded-3xl shadow-xl hover:shadow-2xl transition-all border-2 border-transparent hover:border-blue-500 flex flex-col items-center">
                <Users className="mb-4 text-blue-600" size={48} />
                <div className="text-2xl font-bold">선생님 메뉴</div>
              </button>
              <div className="bg-white p-10 rounded-3xl shadow-xl border-2 border-green-500 flex flex-col items-center">
                <CheckCircle className="mb-4 text-green-600" size={48} />
                <div className="text-2xl font-bold mb-4">학생 응시하기</div>
                <div className="flex w-full gap-2">
                  <input type="text" placeholder="시험 코드" className="w-full border p-3 rounded-xl outline-none focus:ring-2 focus:ring-green-500" value={currentExamId} onChange={e => setCurrentExamId(e.target.value)} />
                  <button onClick={() => currentExamId && setView('student-entry')} className="bg-green-600 text-white px-6 rounded-xl font-bold">입장</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 관리자 로그인 */}
        {view === 'admin-login' && (
          <div className="max-w-md mx-auto py-20">
            <div className="bg-white p-10 rounded-3xl shadow-2xl border text-center">
              <h2 className="text-2xl font-bold mb-6">관리자 본인 인증</h2>
              <input type="password" placeholder="비밀번호" className="w-full border p-4 rounded-xl mb-4 outline-none focus:ring-2 focus:ring-blue-500 text-center text-2xl tracking-widest" value={adminPasswordInput} onChange={e => setAdminPasswordInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAdminLogin()} />
              <button onClick={handleAdminLogin} className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-blue-700 transition-colors">확인</button>
              <button onClick={() => setView('home')} className="mt-4 text-gray-400 text-sm hover:underline">취소</button>
            </div>
          </div>
        )}

        {/* 관리자 대시보드 */}
        {view === 'admin-dash' && (
          <div className="py-8 animate-in slide-in-from-bottom-4 duration-500">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-3xl font-bold">시험 관리 대시보드</h2>
              <button onClick={() => { setEditingExamId(null); setView('admin-create'); }} className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg hover:bg-blue-700"><Plus size={20} /> 새 시험 만들기</button>
            </div>
            <div className="grid gap-4">
              {exams.length === 0 ? (
                <div className="bg-white p-20 rounded-3xl border border-dashed text-center text-gray-400">등록된 시험이 없습니다.</div>
              ) : exams.map(exam => (
                <div key={exam.id} className="bg-white p-6 rounded-2xl shadow-sm border flex flex-col sm:flex-row justify-between items-center gap-4">
                  <div className="text-center sm:text-left">
                    <h3 className="text-xl font-bold text-gray-800">{exam.title}</h3>
                    <p className="text-sm text-gray-400">{exam.questions?.length || 0}문제 중 {exam.displayCount || 0}개 무작위 출제</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleCopyLink(exam.id)} className="p-3 bg-gray-100 rounded-xl hover:bg-gray-200" title="링크 복사"><Copy size={20} /></button>
                    <button onClick={() => handleEditClick(exam)} className="p-3 bg-yellow-50 text-yellow-600 rounded-xl hover:bg-yellow-100"><Edit size={20} /></button>
                    <button onClick={() => { setCurrentExamId(exam.id); setView('admin-results'); }} className="p-3 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100"><BarChart2 size={20} /></button>
                    <button onClick={async () => { if(confirm('이 시험을 정말 삭제하시겠습니까?')) await deleteDoc(doc(db, 'exams', exam.id)); }} className="p-3 bg-red-50 text-red-600 rounded-xl hover:bg-red-100"><Trash2 size={20} /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 시험 결과 통계 */}
        {view === 'admin-results' && (
          <div className="py-8 max-w-4xl mx-auto">
            <button onClick={() => setView('admin-dash')} className="mb-8 flex items-center gap-2 text-gray-500 hover:text-gray-800 transition-colors"><ArrowLeft /> 목록으로 돌아가기</button>
            <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border mb-8">
              <h3 className="text-2xl font-black mb-8 flex items-center gap-2"><BarChart2 className="text-blue-600" /> 문항별 정답 분석</h3>
              <div className="space-y-6">
                {(exams.find(e => e.id === currentExamId)?.questions || []).map((q, i) => {
                  const res = results.filter(r => r.examId === currentExamId);
                  const att = res.filter(r => r.answers && r.answers[i] !== undefined).length;
                  const cor = res.filter(r => r.answers && r.answers[i] === q.answerIndex).length;
                  const rate = att > 0 ? Math.round((cor / att) * 100) : 0;
                  return (
                    <div key={i}>
                      <div className="flex justify-between text-sm font-bold mb-2">
                        <span className="truncate pr-4">Q{i+1}. {q.text}</span>
                        <span className={rate >= 70 ? 'text-green-600' : rate >= 40 ? 'text-orange-500' : 'text-red-500'}>{rate}%</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                        <div className={`h-full transition-all duration-1000 ${rate >= 70 ? 'bg-green-500' : rate >= 40 ? 'bg-orange-500' : 'bg-red-500'}`} style={{ width: `${rate}%` }}></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="bg-white rounded-3xl shadow-sm border overflow-hidden">
              <div className="p-6 border-b bg-gray-50 flex justify-between items-center">
                <h4 className="font-bold">응시자 명단 ({results.filter(r => r.examId === currentExamId).length}명)</h4>
                <button onClick={() => {
                  let csv = "\uFEFF순위,이름,점수,정답수,날짜\n";
                  results.filter(r => r.examId === currentExamId).sort((a,b) => b.score - a.score).forEach((r, i) => {
                    csv += `${i+1},${r.studentName},${r.score},${r.correctCount},${new Date(r.createdAt).toLocaleString()}\n`;
                  });
                  const blob = new Blob([csv], { type: 'text/csv' });
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url; a.download = '결과.csv'; a.click();
                }} className="text-sm bg-white border px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 hover:bg-gray-50"><Download size={14} /> 엑셀 저장</button>
              </div>
              <table className="w-full text-left">
                <thead className="bg-gray-50 text-xs text-gray-400 border-b"><tr><th className="p-5">응시자</th><th className="p-5">점수</th><th className="p-5 text-right">제출 시간</th></tr></thead>
                <tbody>
                  {results.filter(r => r.examId === currentExamId).sort((a,b) => b.createdAt - a.createdAt).map(r => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="p-5 font-bold">{r.studentName}</td>
                      <td className="p-5 font-black text-blue-600 text-xl">{r.score}점</td>
                      <td className="p-5 text-right text-gray-400 text-sm">{new Date(r.createdAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 시험 출제/편집 */}
        {view === 'admin-create' && (
          <div className="py-8 max-w-3xl mx-auto pb-40">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <button onClick={() => setView('admin-dash')} className="p-3 hover:bg-white rounded-full"><ArrowLeft /></button>
                <h2 className="text-3xl font-bold">{editingExamId ? '시험 편집하기' : '새 시험 만들기'}</h2>
              </div>
              <button onClick={() => setShowBulkUpload(!showBulkUpload)} className="text-green-700 bg-green-50 px-4 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-green-100 transition-colors"><FileSpreadsheet size={18} /> 엑셀 등록</button>
            </div>
            
            <div className="space-y-6">
              <div className="bg-white p-8 rounded-3xl border shadow-sm flex flex-col md:flex-row gap-6">
                <div className="flex-[3]">
                  <label className="text-xs font-bold text-gray-400 mb-2 block uppercase">시험 제목</label>
                  <input type="text" className="w-full text-xl font-bold border-b-2 py-2 focus:border-blue-600 outline-none" value={newExamTitle} onChange={e => setNewExamTitle(e.target.value)} placeholder="예: 1학기 형성평가" />
                </div>
                <div className="flex-1">
                  <label className="text-xs font-bold text-gray-400 mb-2 block uppercase">랜덤 문항 수</label>
                  <input type="number" className="w-full text-xl font-bold border-b-2 py-2 focus:border-blue-600 outline-none" placeholder="전체" value={displayCount} onChange={e => setDisplayCount(e.target.value)} />
                </div>
              </div>

              {showBulkUpload && (
                <div className="bg-green-50 p-6 rounded-3xl border-2 border-green-200 border-dashed animate-in fade-in slide-in-from-top-2">
                  <p className="text-sm text-green-800 mb-4 font-medium">엑셀 데이터(문제, 보기1, 2, 3, 4, 정답번호)를 아래에 붙여넣으세요.</p>
                  <textarea className="w-full h-40 border p-4 rounded-2xl mb-4 text-sm font-mono focus:ring-2 focus:ring-green-500 outline-none" value={bulkData} onChange={e => setBulkData(e.target.value)} placeholder="문제내용	보기1	보기2	보기3	보기4	정답번호(1-4)" />
                  <button onClick={() => {
                    const rows = bulkData.split('\n').filter(r => r.trim());
                    const parsed = rows.map(row => {
                      const cols = row.split(/\t|,/).map(c => c.trim());
                      return { text: cols[0], options: [cols[1], cols[2], cols[3], cols[4]], answerIndex: (parseInt(cols[5]) - 1) || 0 };
                    });
                    setNewQuestions(parsed); setShowBulkUpload(false); setBulkData(''); showToast('성공적으로 변환되었습니다!');
                  }} className="w-full bg-green-600 text-white py-3 rounded-xl font-bold hover:bg-green-700">지금 즉시 변환</button>
                </div>
              )}

              {newQuestions.map((q, i) => (
                <div key={i} className="bg-white p-8 rounded-3xl border shadow-sm relative group animate-in fade-in slide-in-from-bottom-4">
                  <button onClick={() => setNewQuestions(newQuestions.filter((_, idx) => idx !== i))} className="absolute top-6 right-6 text-gray-300 hover:text-red-500 transition-colors"><Trash2 size={20} /></button>
                  <label className="text-xs font-bold text-blue-500 mb-2 block">문항 {i+1}</label>
                  <textarea className="w-full text-lg font-bold border rounded-2xl p-4 mb-6 outline-none focus:ring-2 focus:ring-blue-600 min-h-[100px]" value={q.text} onChange={e => { const n = [...newQuestions]; n[i].text = e.target.value; setNewQuestions(n); }} placeholder="문제 내용을 입력하세요" />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                    {q.options.map((opt, oi) => (
                      <div key={oi} className="flex items-center gap-2">
                        <span className="text-gray-300 font-bold">{oi+1}</span>
                        <input className="w-full border p-3 rounded-xl text-sm focus:border-blue-600 outline-none" value={opt} onChange={e => { const n = [...newQuestions]; n[i].options[oi] = e.target.value; setNewQuestions(n); }} placeholder={`보기 ${oi+1}`} />
                      </div>
                    ))}
                  </div>
                  <div className="bg-blue-50 p-4 rounded-2xl flex items-center justify-between">
                    <span className="text-blue-800 font-bold">정답 번호 선택</span>
                    <select className="bg-white border-none p-2 rounded-xl font-bold shadow-sm outline-none" value={q.answerIndex} onChange={e => { const n = [...newQuestions]; n[i].answerIndex = parseInt(e.target.value); setNewQuestions(n); }}>
                      <option value={0}>1번 정답</option><option value={1}>2번 정답</option><option value={2}>3번 정답</option><option value={3}>4번 정답</option>
                    </select>
                  </div>
                </div>
              ))}
              
              <div className="flex flex-col sm:flex-row gap-4 pt-4 pb-20">
                <button onClick={() => setNewQuestions([...newQuestions, { text: '', options: ['', '', '', ''], answerIndex: 0 }])} className="flex-1 py-5 border-2 border-dashed rounded-[2rem] text-gray-400 font-bold hover:bg-white hover:text-blue-500 hover:border-blue-300 transition-all">+ 직접 문제 추가</button>
                <button onClick={handleSaveExam} className="flex-1 py-5 bg-blue-600 text-white rounded-[2rem] font-bold shadow-xl hover:bg-blue-700 transition-all">시험 저장 및 발행하기</button>
              </div>
            </div>
          </div>
        )}

        {/* 학생 응시 준비 */}
        {view === 'student-entry' && (
          <div className="flex flex-col items-center justify-center py-20 animate-in zoom-in duration-500">
            <div className="bg-white p-12 rounded-[3rem] shadow-2xl border w-full max-w-md text-center">
              <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-8 shadow-inner"><ClipboardList size={40} /></div>
              <h2 className="text-3xl font-black mb-2 leading-tight">{exams.find(e => e.id === currentExamId)?.title || '알 수 없는 시험'}</h2>
              <p className="text-gray-400 mb-10">이름을 입력하고 준비가 되면 시작하세요.</p>
              <input type="text" placeholder="본인 성함 입력" className="w-full border-2 p-5 rounded-2xl mb-4 outline-none focus:ring-4 focus:ring-blue-100 text-center text-xl font-bold" value={studentName} onChange={e => setStudentName(e.target.value)} onKeyDown={e => e.key === 'Enter' && startExam()} />
              <button onClick={startExam} className="w-full bg-blue-600 text-white py-5 rounded-2xl font-black text-xl shadow-lg hover:bg-blue-700 transition-all">지금 바로 시작하기</button>
              <button onClick={() => setView('home')} className="mt-4 text-gray-300 text-sm hover:underline">홈으로</button>
            </div>
          </div>
        )}

        {/* 시험 진행 중 */}
        {view === 'student-take' && (
          <div className="max-w-2xl mx-auto py-10 pb-40 animate-in fade-in slide-in-from-bottom-10 duration-700">
            <div className="bg-white/90 backdrop-blur-md sticky top-20 z-10 p-5 border-b mb-10 flex justify-between items-center rounded-3xl shadow-sm border">
              <h2 className="font-bold text-xl truncate pr-4">{exams.find(e => e.id === currentExamId)?.title}</h2>
              <div className="px-4 py-2 bg-blue-600 text-white rounded-full text-sm font-black whitespace-nowrap shadow-md">{studentName} 님</div>
            </div>
            <div className="space-y-12">
              {activeQuestions.map((q, i) => (
                <div key={i} className="bg-white p-8 sm:p-12 rounded-[3rem] shadow-sm border border-gray-100">
                  <div className="flex gap-4 mb-8 text-2xl font-bold leading-snug">
                    <span className="text-blue-600 font-black">Q{i+1}.</span>
                    <p>{q.text}</p>
                  </div>
                  <div className="grid gap-4">
                    {q.options.map((opt, oi) => {
                      const sel = studentAnswers[q.originalIndex!] === oi;
                      return (
                        <button key={oi} onClick={() => setStudentAnswers({...studentAnswers, [q.originalIndex!]: oi})} className={`text-left p-6 rounded-[1.5rem] border-2 transition-all text-lg font-bold flex justify-between items-center ${sel ? 'border-blue-600 bg-blue-50 text-blue-800 shadow-md scale-[1.02]' : 'border-gray-50 hover:bg-gray-50 text-gray-600'}`}>
                          <span>{oi+1}. {opt}</span>
                          {sel && <CheckCircle size={24} className="text-blue-600" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="fixed bottom-10 left-0 w-full px-6 flex justify-center z-40">
              <button onClick={submitExam} className="w-full max-w-2xl bg-blue-600 text-white py-7 rounded-[2.5rem] font-black text-2xl shadow-2xl hover:scale-105 active:scale-95 transition-all">답안 제출하고 결과 확인</button>
            </div>
          </div>
        )}

        {/* 결과 발표 */}
        {view === 'student-result' && (
          <div className="flex flex-col items-center justify-center py-20 animate-in zoom-in duration-700">
            <div className="bg-white p-12 rounded-[4rem] shadow-2xl w-full max-w-md text-center relative overflow-hidden border">
              <div className="absolute top-0 left-0 w-full h-40 bg-gradient-to-br from-blue-500 to-indigo-700"></div>
              <div className="relative z-10">
                <div className="w-32 h-32 bg-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-2xl border-[10px] border-blue-50"><Trophy size={64} className="text-yellow-400" /></div>
                <h2 className="text-3xl font-black text-white mb-10 tracking-tight">응시가 완료되었습니다!</h2>
                <div className="bg-gray-50 p-10 rounded-[3.5rem] mb-10 border shadow-inner">
                  <span className="block text-gray-400 font-bold mb-3 uppercase tracking-widest text-xs">나의 최종 점수</span>
                  <div className="text-8xl font-black text-blue-600 leading-none tracking-tighter">{studentScore}<span className="text-3xl text-gray-300 ml-1">점</span></div>
                </div>
                <button onClick={() => window.location.href = window.location.origin + window.location.pathname} className="w-full bg-gray-100 py-5 rounded-3xl font-black text-xl text-gray-500 hover:bg-gray-200 transition-colors">닫기</button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* 토스트 메시지 */}
      {toastMessage && (
        <div className="fixed bottom-12 left-1/2 -translate-x-1/2 bg-gray-900/90 backdrop-blur-md text-white px-8 py-4 rounded-full shadow-2xl z-[100] flex items-center gap-3 animate-in fade-in slide-in-from-bottom-10 duration-300 font-bold">
          <AlertCircle size={20} className="text-blue-400" /> {toastMessage}
        </div>
      )}
    </div>
  );
}

// --- 헬퍼 함수 ---
function handleAdminLogin(this: any) {
  // 컴포넌트 내부에서 상태를 직접 사용하므로 별도 헬퍼 없이 인라인으로 처리했습니다.
}