import { useState, type ChangeEvent } from 'react';
import { Upload, FileText, AlertTriangle, CheckCircle, BarChart2, Users, RefreshCcw, Eye, ShieldAlert, Timer, ArrowRight, Settings } from 'lucide-react';

// --- INTERFACES (TIPAGENS PARA TYPESCRIPT) ---

interface PerformanceRow {
  id: number;
  nome: string;
  teamLeader: string;
  periodo: string;
  meta: number;
  prodLiq: number;
  tempoProcRaw: string;
  tempoProcSec: number;
  unidades: number;
  isIndirect: boolean;
  isOffender: boolean;
  // Campos calculados na análise
  maxStreak?: number;
  totalOffenses?: number;
  totalRows?: number;
  offenseRate?: number;
  history?: PerformanceRow[];
}

interface SetupRow {
  id: number;
  nome: string;
  teamLeader: string;
  // Fast Start
  clockIn: string;
  primeiroBip: string;
  tempoBipEntrada: string;
  tempoBipEntradaSec: number;
  isFastStartOffender: boolean;
  // Strong Finish
  ultimoBipRaw: string;
  targetSaidaRaw: string;
  clockOutRaw: string;
  isStrongFinishOffender: boolean;
  sfReason: string;
}

interface LeaderStat {
  name: string;
  count: number; // Para Setup
  totalImpact?: number; // Para Performance
}

interface SetupResults {
  fastStart: SetupRow[];
  strongFinish: SetupRow[];
  leaders: LeaderStat[];
}

// --- APP ---

const App = () => {
  // Global State
  const [appMode, setAppMode] = useState<'performance' | 'setup' | null>(null);
  
  // Common State
  const [fileData, setFileData] = useState<any[] | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [processing, setProcessing] = useState<boolean>(false);
  const [debugMode, setDebugMode] = useState<boolean>(false);
  
  // Performance Mode State
  const [granularity, setGranularity] = useState<'hourly' | 'daily' | null>(null);
  const [perfViewMode, setPerfViewMode] = useState<'performance' | 'indirects'>('performance');
  const [perfResults, setPerfResults] = useState<PerformanceRow[] | null>(null);
  const [perfLeaders, setPerfLeaders] = useState<LeaderStat[]>([]);
  const [perfIndirects, setPerfIndirects] = useState<PerformanceRow[]>([]);

  // Setup Mode State
  const [setupViewMode, setSetupViewMode] = useState<'fast_start' | 'strong_finish'>('fast_start');
  const [setupResults, setSetupResults] = useState<SetupResults | null>(null);

  // --- HELPERS ---

  const timeToSeconds = (timeStr: string): number => {
    if (!timeStr) return 0;
    try {
      const parts = timeStr.split(':');
      if (parts.length < 2) return 0; 
      const h = +parts[0] || 0;
      const m = +parts[1] || 0;
      const s = parts.length === 3 ? +parts[2] : 0;
      return h * 3600 + m * 60 + s;
    } catch (e) {
      return 0;
    }
  };

  const parseBrazilianNumber = (numStr: string): number => {
    if (!numStr) return 0;
    if (typeof numStr === 'number') return numStr;
    const cleanStr = numStr.replace(/\./g, '').replace(',', '.').replace('%', '');
    return parseFloat(cleanStr) || 0;
  };

  const parseDate = (dateStr: string): Date | null => {
    if (!dateStr) return null;
    let d = new Date(dateStr.replace(/"/g, ''));
    if (!isNaN(d.getTime())) return d;
    return null;
  };

  const getDifferenceInMinutes = (dateA: Date, dateB: Date): number => {
    if (!dateA || !dateB) return 0;
    const diffMs = dateA.getTime() - dateB.getTime(); 
    return Math.floor(diffMs / 60000);
  };

  // --- HANDLERS ---

  const handleFileUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setProcessing(true);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result;
      if (typeof text === 'string') {
        if (appMode === 'performance') {
          processPerformanceCSV(text);
        } else {
          processSetupCSV(text);
        }
      }
    };
    reader.readAsText(file);
  };

  // --- PARSER: PERFORMANCE ---
  const processPerformanceCSV = (text: string) => {
    try {
      const lines = text.split('\n').filter(line => line.trim() !== '');
      const IDX_PERIODO = 0;
      const IDX_NOME = 1;
      const IDX_TEAM_LEADER = 2;
      const IDX_META = 3;
      const IDX_PROD_LIQ = 7;
      const IDX_TEMPO_PROC = 11;
      const IDX_UNIDADES = 18; 
      const MIN_COLS = 12; 

      const parsedData: PerformanceRow[] = lines.slice(1).map((line, index) => {
        const cols = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
        if (cols.length < MIN_COLS) return null;
        const cleanCol = (val: string) => val ? val.trim().replace(/^"|"$/g, '') : '';

        const nome = cleanCol(cols[IDX_NOME]);
        const teamLeader = cleanCol(cols[IDX_TEAM_LEADER]);
        const periodo = cleanCol(cols[IDX_PERIODO]);
        const meta = parseBrazilianNumber(cleanCol(cols[IDX_META]));
        const prodLiq = parseBrazilianNumber(cleanCol(cols[IDX_PROD_LIQ]));
        const tempoProcRaw = cleanCol(cols[IDX_TEMPO_PROC]);
        const tempoProcSec = timeToSeconds(tempoProcRaw);
        
        let unidadesRaw = '0';
        if (cols[IDX_UNIDADES]) {
            unidadesRaw = cleanCol(cols[IDX_UNIDADES]);
        } else {
            unidadesRaw = cleanCol(cols[cols.length - 1]);
        }
        const unidades = parseBrazilianNumber(unidadesRaw);

        const isIndirect = (tempoProcSec >= 3600) && (unidades === 0);
        const isOffender = (tempoProcSec >= 3600) && (prodLiq < meta) && !isIndirect;

        return { 
          id: index, 
          nome, 
          teamLeader, 
          periodo, 
          meta, 
          prodLiq, 
          tempoProcRaw, 
          tempoProcSec, 
          unidades, 
          isIndirect, 
          isOffender 
        };
      }).filter((item): item is PerformanceRow => item !== null);

      if (parsedData.length === 0) {
        alert("Nenhum dado válido. Verifique o layout de Performance.");
        setProcessing(false);
        return;
      }
      setFileData(parsedData);
      setProcessing(false);
    } catch (error) {
      console.error(error);
      alert("Erro crítico ao processar arquivo.");
      setProcessing(false);
    }
  };

  // --- PARSER: SETUP TIME ---
  const processSetupCSV = (text: string) => {
    try {
      const lines = text.split('\n').filter(line => line.trim() !== '');
      const IDX_NOME = 2;
      const IDX_LEADER = 3;
      const IDX_CLOCK_IN = 6;
      const IDX_PRIMEIRO_BIP = 8;
      const IDX_TEMPO_BIP_ENTRADA = 11;
      const IDX_ULTIMO_BIP = 17;
      const IDX_TARGET_SAIDA = 19;
      const IDX_CLOCK_OUT = 20;

      const parsedData: SetupRow[] = lines.slice(1).map((line, index) => {
        const cols = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
        if (cols.length < 12) return null; 
        const cleanCol = (val: string) => val ? val.trim().replace(/^"|"$/g, '') : '';

        const nome = cleanCol(cols[IDX_NOME]);
        const teamLeader = cleanCol(cols[IDX_LEADER]);
        
        const clockIn = cleanCol(cols[IDX_CLOCK_IN]);
        const primeiroBip = cleanCol(cols[IDX_PRIMEIRO_BIP]);
        const tempoBipEntrada = cleanCol(cols[IDX_TEMPO_BIP_ENTRADA]);
        const tempoBipEntradaSec = timeToSeconds(tempoBipEntrada);

        const ultimoBipRaw = cleanCol(cols[IDX_ULTIMO_BIP]);
        const targetSaidaRaw = cleanCol(cols[IDX_TARGET_SAIDA]);
        const clockOutRaw = cleanCol(cols[IDX_CLOCK_OUT]);

        const isFastStartOffender = tempoBipEntradaSec > 900;

        let isStrongFinishOffender = false;
        let sfReason = '';

        const dateUltimo = parseDate(ultimoBipRaw);
        const dateTarget = parseDate(targetSaidaRaw);
        const dateClockOut = parseDate(clockOutRaw);

        if (dateUltimo && dateTarget) {
            if (dateUltimo < dateTarget) {
                isStrongFinishOffender = true;
                sfReason = 'Parou antes da meta';
            }
            else if (dateClockOut) {
                const diffMins = getDifferenceInMinutes(dateClockOut, dateUltimo);
                if (diffMins > 5) {
                    isStrongFinishOffender = true;
                    sfReason = 'Demora na saída (>5min)';
                }
            }
        }

        return {
            id: index,
            nome,
            teamLeader,
            clockIn,
            primeiroBip,
            tempoBipEntrada,
            tempoBipEntradaSec,
            isFastStartOffender,
            ultimoBipRaw,
            targetSaidaRaw,
            clockOutRaw,
            isStrongFinishOffender,
            sfReason
        };
      }).filter((item): item is SetupRow => item !== null);

      if (parsedData.length === 0) {
        alert("Nenhum dado válido. Verifique o layout de Setup Time.");
        setProcessing(false);
        return;
      }

      setFileData(parsedData);
      
      const fsOffenders = parsedData.filter(d => d.isFastStartOffender);
      const sfOffenders = parsedData.filter(d => d.isStrongFinishOffender);
      
      const leaders: Record<string, number> = {};
      [...fsOffenders, ...sfOffenders].forEach(row => {
          if(!row.teamLeader) return;
          if(!leaders[row.teamLeader]) leaders[row.teamLeader] = 0;
          leaders[row.teamLeader]++;
      });
      const leaderRanking: LeaderStat[] = Object.entries(leaders)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 3)
        .map(([name, count]) => ({ name, count }));

      setSetupResults({
          fastStart: fsOffenders.sort((a,b) => b.tempoBipEntradaSec - a.tempoBipEntradaSec), 
          strongFinish: sfOffenders,
          leaders: leaderRanking
      });

      setProcessing(false);
    } catch (error) {
      console.error(error);
      alert("Erro ao processar Setup Time.");
      setProcessing(false);
    }
  };

  // --- ANALYSIS: PERFORMANCE ---
  const runPerformanceAnalysis = (mode: 'hourly' | 'daily') => {
    setGranularity(mode);
    if (!fileData) return;

    // Type casting seguro
    const data = fileData as PerformanceRow[];

    const indirects = data.filter(row => row.isIndirect);
    setPerfIndirects(indirects);

    const users: Record<string, PerformanceRow> = {};
    const leaders: Record<string, { name: string, totalImpact: number }> = {};

    data.forEach(row => {
      if (row.isIndirect) return;
      if (!users[row.nome]) {
        users[row.nome] = { 
          ...row, 
          totalRows: 0, 
          totalOffenses: 0, 
          history: [] 
        };
      }
      
      // Asserção de tipo para propriedades opcionais
      const user = users[row.nome];
      if (user.totalRows !== undefined) user.totalRows++;
      
      if (row.teamLeader && !leaders[row.teamLeader]) {
        leaders[row.teamLeader] = { name: row.teamLeader, totalImpact: 0 };
      }
      if (row.isOffender) {
        if (user.totalOffenses !== undefined) user.totalOffenses++;
        if (row.teamLeader) leaders[row.teamLeader].totalImpact++;
      }
      user.history?.push(row);
    });

    const rankingUsers = Object.values(users).map(user => {
      let maxStreak = 0;
      let currentStreak = 0;
      user.history?.forEach(row => {
        if (row.isOffender) currentStreak++;
        else {
          if (currentStreak > maxStreak) maxStreak = currentStreak;
          currentStreak = 0;
        }
      });
      if (currentStreak > maxStreak) maxStreak = currentStreak;
      
      const totalOffenses = user.totalOffenses || 0;
      const totalRows = user.totalRows || 0;

      return { 
        ...user, 
        maxStreak, 
        offenseRate: totalRows > 0 ? (totalOffenses / totalRows) * 100 : 0 
      };
    }).filter(u => (u.totalOffenses || 0) > 0); 

    rankingUsers.sort((a, b) => {
      if (b.maxStreak !== a.maxStreak) return (b.maxStreak || 0) - (a.maxStreak || 0);
      return (b.totalOffenses || 0) - (a.totalOffenses || 0);
    });

    const rankingLeaders: LeaderStat[] = Object.values(leaders)
        .filter(l => l.totalImpact > 0)
        .sort((a, b) => b.totalImpact - a.totalImpact)
        .slice(0, 3)
        .map(l => ({ name: l.name, count: 0, totalImpact: l.totalImpact }));

    setPerfResults(rankingUsers);
    setPerfLeaders(rankingLeaders);
  };

  const reset = () => {
    setFileData(null);
    setFileName('');
    setPerfResults(null);
    setSetupResults(null);
    setPerfLeaders([]);
    setPerfIndirects([]);
    setGranularity(null);
    setDebugMode(false);
    setPerfViewMode('performance');
    setSetupViewMode('fast_start');
    setAppMode(null); 
  };

  const softReset = () => {
      setFileData(null);
      setFileName('');
      setPerfResults(null);
      setSetupResults(null);
  }

  // --- RENDER ---

  if (!appMode) {
      return (
        <div className="min-h-screen w-full bg-slate-50 flex items-center justify-center p-4">
            <div className="max-w-4xl w-full">
                <div className="text-center mb-12">
                    <h1 className="text-4xl font-bold text-slate-800 mb-4">Portal de Análise Operacional</h1>
                    <p className="text-slate-500">Selecione o indicador que deseja analisar hoje</p>
                </div>
                
                <div className="grid md:grid-cols-2 gap-8">
                    <button 
                        onClick={() => setAppMode('performance')}
                        className="bg-white p-8 rounded-2xl shadow-sm border-2 border-transparent hover:border-blue-500 hover:shadow-xl transition-all text-left group"
                    >
                        <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center text-blue-600 mb-6 group-hover:scale-110 transition-transform">
                            <BarChart2 size={32} />
                        </div>
                        <h2 className="text-2xl font-bold text-slate-800 mb-2">Performance & Produtividade</h2>
                        <p className="text-slate-500 mb-6">
                            Analise meta vs realizado, identifique ofensores recorrentes (horas/dias) e valide indiretos.
                        </p>
                        <span className="text-blue-600 font-bold flex items-center gap-2">Acessar Painel <ArrowRight size={16}/></span>
                    </button>

                    <button 
                        onClick={() => setAppMode('setup')}
                        className="bg-white p-8 rounded-2xl shadow-sm border-2 border-transparent hover:border-purple-500 hover:shadow-xl transition-all text-left group"
                    >
                        <div className="w-16 h-16 bg-purple-100 rounded-2xl flex items-center justify-center text-purple-600 mb-6 group-hover:scale-110 transition-transform">
                            <Timer size={32} />
                        </div>
                        <h2 className="text-2xl font-bold text-slate-800 mb-2">Setup Time (Pontualidade)</h2>
                        <p className="text-slate-500 mb-6">
                            Analise indicadores de <strong>Fast Start</strong> (atraso no início) e <strong>Strong Finish</strong> (saída antecipada).
                        </p>
                        <span className="text-purple-600 font-bold flex items-center gap-2">Acessar Painel <ArrowRight size={16}/></span>
                    </button>
                </div>
            </div>
        </div>
      );
  }

  // 2. MAIN APP CONTAINER
  return (
    <div className="min-h-screen w-full bg-slate-50 text-slate-800 font-sans p-4 md:p-8">
      <div className="w-full mx-auto">
        
        {/* Header */}
        <header className="mb-8 border-b border-slate-200 pb-4 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
                {appMode === 'performance' ? <BarChart2 className="text-blue-600" /> : <Timer className="text-purple-600" />}
                {appMode === 'performance' ? 'Performance & Produtividade' : 'Setup Time (Pontualidade)'}
            </h1>
            <p className="text-slate-500 mt-1 text-sm">
                {appMode === 'performance' 
                    ? 'Identifique gargalos de meta e indiretos.' 
                    : 'Analise Fast Start (>15min) e Strong Finish.'}
            </p>
          </div>
          <button onClick={reset} className="text-slate-500 hover:text-slate-800 font-medium text-sm flex items-center gap-1">
              <Settings size={14} /> Trocar Painel
          </button>
        </header>

        {/* --- UPLOAD SECTION --- */}
        {!fileData && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center max-w-4xl mx-auto">
            <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 ${appMode === 'performance' ? 'bg-blue-50 text-blue-500' : 'bg-purple-50 text-purple-500'}`}>
              <Upload className="w-10 h-10" />
            </div>
            <h2 className="text-xl font-semibold mb-2">
                Upload Base de {appMode === 'performance' ? 'Performance' : 'Setup Time'}
            </h2>
            <p className="text-slate-400 mb-6 max-w-lg mx-auto text-sm">
              {appMode === 'performance' ? (
                  <>Colunas: Período, Nome, Leader, Meta, Prod, Tempo, Unidades.</>
              ) : (
                  <>Colunas: Nome, Leader, Clock In, 1º Bip, Tempo Entrada, Último Bip, Target Saída, Clock Out.</>
              )}
            </p>
            <input type="file" accept=".csv,.txt" onChange={handleFileUpload} className="hidden" id="csvUpload"/>
            <label htmlFor="csvUpload" className={`inline-flex items-center gap-2 px-6 py-3 text-white font-medium rounded-lg cursor-pointer transition-colors ${appMode === 'performance' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-purple-600 hover:bg-purple-700'}`}>
              <FileText size={20} /> Selecionar CSV
            </label>
            {processing && <p className="mt-4 text-slate-400 animate-pulse">Processando dados...</p>}
          </div>
        )}

        {/* --- PERFORMANCE ANALYZER DASHBOARD --- */}
        {fileData && appMode === 'performance' && (
            <div className="space-y-6">
                {!perfResults ? (
                    /* Config Screen Performance */
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 max-w-4xl mx-auto">
                        <div className="flex items-center justify-between mb-8">
                            <h2 className="text-xl font-bold flex items-center gap-2"><CheckCircle className="text-green-500"/> Arquivo Carregado</h2>
                            <div className="flex gap-4">
                                <button 
                                  onClick={() => setDebugMode(!debugMode)}
                                  className="flex items-center gap-2 text-slate-500 hover:text-blue-600 text-sm"
                                >
                                  <Eye size={16} />
                                  {debugMode ? 'Ocultar Diagnóstico' : 'Ver Diagnóstico'}
                                </button>
                                <button onClick={softReset} className="text-red-500 text-sm">Cancelar</button>
                            </div>
                        </div>

                        {/* DEBUG TABLE */}
                        {debugMode && (
                          <div className="mb-8 p-4 bg-slate-100 rounded-lg overflow-x-auto">
                            <h4 className="font-bold text-sm mb-2 text-slate-700">Diagnóstico (Primeiras 3 linhas):</h4>
                            <table className="w-full text-xs text-left bg-white rounded border border-slate-300">
                              <thead className="bg-slate-200">
                                <tr>
                                  <th className="p-2 border">Colab</th>
                                  <th className="p-2 border">Leader</th>
                                  <th className="p-2 border">Meta</th>
                                  <th className="p-2 border">Tempo</th>
                                  <th className="p-2 border">Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {fileData.slice(0, 3).map((row: PerformanceRow, i) => (
                                  <tr key={i} className="border-b">
                                    <td className="p-2 border">{row.nome}</td>
                                    <td className="p-2 border">{row.teamLeader}</td>
                                    <td className="p-2 border">{row.meta}</td>
                                    <td className="p-2 border">{row.tempoProcRaw}</td>
                                    <td className="p-2 border font-bold">
                                      {row.isIndirect ? 
                                        <span className="text-orange-500">INDIRETO</span> : 
                                        (row.isOffender ? <span className="text-red-600">OFENSOR</span> : <span className="text-green-600">OK</span>)
                                      }
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        <div className="grid md:grid-cols-2 gap-4 max-w-2xl mx-auto">
                            <button onClick={() => runPerformanceAnalysis('hourly')} className="p-6 border-2 border-slate-100 hover:border-blue-500 rounded-xl text-left hover:bg-blue-50 transition-all">
                                <span className="font-bold block text-lg mb-1 text-blue-900">Base em Horas</span>
                                <span className="text-sm text-slate-500">Recorrência no mesmo dia</span>
                            </button>
                            <button onClick={() => runPerformanceAnalysis('daily')} className="p-6 border-2 border-slate-100 hover:border-purple-500 rounded-xl text-left hover:bg-purple-50 transition-all">
                                <span className="font-bold block text-lg mb-1 text-purple-900">Base em Dias</span>
                                <span className="text-sm text-slate-500">Recorrência na semana</span>
                            </button>
                        </div>
                    </div>
                ) : (
                    /* Results Performance */
                    <>
                        <div className="flex border-b border-slate-200">
                            <button onClick={() => setPerfViewMode('performance')} className={`px-6 py-3 font-medium text-sm border-b-2 ${perfViewMode === 'performance' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500'}`}>Performance</button>
                            <button onClick={() => setPerfViewMode('indirects')} className={`px-6 py-3 font-medium text-sm border-b-2 ${perfViewMode === 'indirects' ? 'border-orange-500 text-orange-600' : 'border-transparent text-slate-500'}`}>Indiretos ({perfIndirects.length})</button>
                        </div>

                        {perfViewMode === 'performance' && (
                            <>
                                <div className="flex justify-between items-center bg-white p-4 rounded-lg border border-slate-200">
                                    <div className="flex gap-2"><span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-xs font-bold uppercase">{granularity}</span></div>
                                    <button onClick={softReset} className="flex items-center gap-2 text-slate-600 hover:text-slate-900 text-sm"><RefreshCcw size={14}/> Resetar</button>
                                </div>
                                {perfLeaders.length > 0 && (
                                    <div className="bg-slate-800 text-white rounded-xl p-6 shadow-lg">
                                        <h3 className="text-sm font-bold uppercase text-slate-400 mb-4 flex items-center gap-2"><ShieldAlert size={16}/> Top Team Leaders Impactados</h3>
                                        <div className="grid md:grid-cols-3 gap-4">
                                            {perfLeaders.map((l, i) => (
                                                <div key={i} className="bg-slate-700/50 p-3 rounded border border-slate-600 flex justify-between">
                                                    <span className="font-medium truncate pr-2">{l.name}</span>
                                                    <span className="bg-red-500 text-xs font-bold px-2 py-1 rounded">{l.totalImpact}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-slate-100 text-slate-600">
                                            <tr><th className="px-6 py-3">Colaborador</th><th className="px-6 py-3">Leader</th><th className="px-6 py-3 text-center">Maior Seq.</th><th className="px-6 py-3 text-center">Falhas</th></tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {perfResults.map((u, i) => (
                                                <tr key={i} className="hover:bg-slate-50">
                                                    <td className="px-6 py-4 font-medium">{u.nome}</td>
                                                    <td className="px-6 py-4 text-slate-500">{u.teamLeader}</td>
                                                    <td className="px-6 py-4 text-center"><span className="bg-red-100 text-red-700 px-2 py-1 rounded font-bold">{u.maxStreak}</span></td>
                                                    <td className="px-6 py-4 text-center font-bold">{u.totalOffenses}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        )}
                        {perfViewMode === 'indirects' && (
                            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-orange-50 text-orange-800"><tr><th className="px-6 py-3">Nome</th><th className="px-6 py-3">Leader</th><th className="px-6 py-3">Tempo</th><th className="px-6 py-3">Unidades</th></tr></thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {perfIndirects.map((u, i) => (
                                            <tr key={i}><td className="px-6 py-3">{u.nome}</td><td className="px-6 py-3">{u.teamLeader}</td><td className="px-6 py-3">{u.tempoProcRaw}</td><td className="px-6 py-3">{u.unidades}</td></tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </>
                )}
            </div>
        )}

        {/* --- SETUP TIME ANALYZER DASHBOARD --- */}
        {fileData && appMode === 'setup' && setupResults && (
            <div className="space-y-6">
                
                {/* Control Header */}
                <div className="flex justify-between items-center bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                    <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-700">Arquivo:</span>
                        <span className="text-slate-500 text-sm">{fileName}</span>
                    </div>
                    <button onClick={softReset} className="text-red-500 hover:text-red-700 text-sm font-medium">Trocar Arquivo</button>
                </div>

                {/* Leader Stats (Shared) */}
                {setupResults.leaders.length > 0 && (
                    <div className="bg-purple-900 text-white rounded-xl p-6 shadow-lg">
                         <h3 className="text-sm font-bold uppercase text-purple-200 mb-4 flex items-center gap-2">
                            <Users size={16}/> Top Leaders com Problemas de Pontualidade
                        </h3>
                        <div className="grid md:grid-cols-3 gap-4">
                            {setupResults.leaders.map((l, i) => (
                                <div key={i} className="bg-purple-800/50 p-4 rounded-lg border border-purple-700 flex justify-between items-center">
                                    <div className="flex items-center gap-3">
                                        <span className="text-xl font-bold text-purple-300">#{i+1}</span>
                                        <span className="font-medium truncate max-w-[120px]" title={l.name}>{l.name}</span>
                                    </div>
                                    <span className="bg-white text-purple-900 text-xs font-bold px-3 py-1 rounded-full">
                                        {l.count} ofensores
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Tabs */}
                <div className="flex border-b border-slate-200 bg-white rounded-t-xl px-2">
                    <button 
                        onClick={() => setSetupViewMode('fast_start')}
                        className={`px-6 py-4 font-bold text-sm border-b-2 flex items-center gap-2 transition-colors ${setupViewMode === 'fast_start' ? 'border-red-500 text-red-600 bg-red-50' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                    >
                        <Timer size={18}/> Fast Start (Início)
                        <span className="bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full text-xs ml-2">{setupResults.fastStart.length}</span>
                    </button>
                    <button 
                        onClick={() => setSetupViewMode('strong_finish')}
                        className={`px-6 py-4 font-bold text-sm border-b-2 flex items-center gap-2 transition-colors ${setupViewMode === 'strong_finish' ? 'border-blue-500 text-blue-600 bg-blue-50' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                    >
                        <CheckCircle size={18}/> Strong Finish (Fim)
                        <span className="bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full text-xs ml-2">{setupResults.strongFinish.length}</span>
                    </button>
                </div>

                {/* View: Fast Start */}
                {setupViewMode === 'fast_start' && (
                    <div className="bg-white rounded-b-xl shadow-sm border border-t-0 border-slate-200 overflow-hidden">
                        <div className="p-4 bg-red-50 text-red-800 text-sm border-b border-red-100 flex items-center gap-2">
                            <AlertTriangle size={16}/>
                            Exibindo colaboradores com <strong>Tempo de Bip Entrada {'>'} 15:00</strong>
                        </div>
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-100 text-slate-600">
                                <tr>
                                    <th className="px-6 py-3 font-semibold">Colaborador</th>
                                    <th className="px-6 py-3 font-semibold">Leader</th>
                                    <th className="px-6 py-3 font-semibold">Clock In</th>
                                    <th className="px-6 py-3 font-semibold">Primeiro Bip</th>
                                    <th className="px-6 py-3 font-semibold text-right">Tempo Bip Entrada</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {setupResults.fastStart.map((row, i) => (
                                    <tr key={i} className="hover:bg-slate-50">
                                        <td className="px-6 py-4 font-medium text-slate-800">{row.nome}</td>
                                        <td className="px-6 py-4 text-slate-500">{row.teamLeader}</td>
                                        <td className="px-6 py-4 text-slate-500 font-mono text-xs">{row.clockIn}</td>
                                        <td className="px-6 py-4 text-slate-500 font-mono text-xs">{row.primeiroBip}</td>
                                        <td className="px-6 py-4 text-right font-bold text-red-600 font-mono">{row.tempoBipEntrada}</td>
                                    </tr>
                                ))}
                                {setupResults.fastStart.length === 0 && (
                                    <tr><td colSpan={5} className="p-8 text-center text-slate-500">Nenhum ofensor de Fast Start encontrado!</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* View: Strong Finish */}
                {setupViewMode === 'strong_finish' && (
                    <div className="bg-white rounded-b-xl shadow-sm border border-t-0 border-slate-200 overflow-hidden">
                        <div className="p-4 bg-blue-50 text-blue-800 text-sm border-b border-blue-100 flex items-center gap-2">
                            <AlertTriangle size={16}/>
                            Exibindo colaboradores que pararam <strong>antes da meta</strong> ou <strong>demoraram a sair</strong>.
                        </div>
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-100 text-slate-600">
                                <tr>
                                    <th className="px-6 py-3 font-semibold">Colaborador</th>
                                    <th className="px-6 py-3 font-semibold">Motivo</th>
                                    <th className="px-6 py-3 font-semibold">Último Bip</th>
                                    <th className="px-6 py-3 font-semibold">Target Saída</th>
                                    <th className="px-6 py-3 font-semibold">Clock Out</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {setupResults.strongFinish.map((row, i) => (
                                    <tr key={i} className="hover:bg-slate-50">
                                        <td className="px-6 py-4 font-medium text-slate-800">{row.nome}</td>
                                        <td className="px-6 py-4">
                                            <span className={`text-xs px-2 py-1 rounded font-bold ${row.sfReason.includes('meta') ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                                                {row.sfReason}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-slate-500 font-mono text-xs">{row.ultimoBipRaw}</td>
                                        <td className="px-6 py-4 text-slate-500 font-mono text-xs">{row.targetSaidaRaw}</td>
                                        <td className="px-6 py-4 text-slate-500 font-mono text-xs">{row.clockOutRaw}</td>
                                    </tr>
                                ))}
                                {setupResults.strongFinish.length === 0 && (
                                    <tr><td colSpan={5} className="p-8 text-center text-slate-500">Nenhum ofensor de Strong Finish encontrado!</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        )}
      </div>
    </div>
  );
};

export default App;