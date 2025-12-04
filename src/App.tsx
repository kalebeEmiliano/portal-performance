import { useState, type ChangeEvent, useMemo, useEffect, useRef } from 'react';
import { Upload, FileText, AlertTriangle, CheckCircle, BarChart2, Users, RefreshCcw, Eye, ShieldAlert, Timer, ArrowRight, Settings, Coffee, Clock, Filter, BarChart, Percent, TrendingUp, Calendar, Image as ImageIcon } from 'lucide-react';

// --- INTERFACES (TIPAGENS) ---

interface PerformanceRow {
  id: number;
  periodo: string;
  nome: string;
  teamLeader: string;
  meta: number;
  prodLiq: number;
  tempoProcRaw: string;
  tempoProcSec: number;
  unidades: number;
  isIndirect: boolean;
  isOffender: boolean;
  maxStreak?: number;
  totalOffenses?: number;
  totalRows?: number;
  offenseRate?: number;
  history?: PerformanceRow[];
}

interface SetupRow {
  id: number;
  periodo: string;
  nome: string;
  teamLeader: string;
  clockIn: string;
  primeiroBip: string;
  tempoBipEntrada: string;
  tempoBipEntradaSec: number;
  isFastStartOffender: boolean;
  ultimoBipRaw: string;
  targetSaidaRaw: string;
  clockOutRaw: string;
  isStrongFinishOffender: boolean;
  sfReason: string;
  diffExitSec: number;
}

interface LunchRow {
  id: number;
  periodo: string;
  nome: string;
  teamLeader: string;
  tempoCatracaRaw: string;
  tempoCatracaSec: number;
  saidaCatraca: string;
  retornoCatraca: string;
  isCatracaOffender: boolean;
  saidaBip: string; 
  retornoBip: string;
  diffRetornoSec: number; 
  diffRetornoFormatted: string;
  isRetornoOffender: boolean;
  totalIntervalSec: number;
  totalIntervalFormatted: string;
  isTotalIntervalOffender: boolean;
}

interface LeaderStat {
  name: string;
  totalImpact: number;
  totalRows: number;
  totalPeople: number;
  offensePercentage: number;
  uniqueOffenders: number;
  avgProd?: number;        
  avgFirstBip?: number;    
  avgExitDiff?: number;    
  avgCatraca?: number;     
  avgRetorno?: number;     
}

interface SetupResults {
  fastStart: SetupRow[];
  strongFinish: SetupRow[];
  leaders: LeaderStat[];
  allRows: SetupRow[];
}

interface LunchResults {
  catraca: LunchRow[];
  retorno: LunchRow[];
  totalInterval: LunchRow[]; 
  leaders: LeaderStat[];
  allRows: LunchRow[];
}

// --- APP ---

const App = () => {
  // Global State
  const [appMode, setAppMode] = useState<'performance' | 'setup' | 'lunch' | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>('https://placehold.co/100x100/3b82f6/ffffff?text=Logo'); 
  
  // Common State
  const [fileData, setFileData] = useState<any[] | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [processing, setProcessing] = useState<boolean>(false);
  const [debugMode, setDebugMode] = useState<boolean>(false);

  // Filters State
  const [selectedLeader, setSelectedLeader] = useState<string>('Todos');
  const [selectedCollaborator, setSelectedCollaborator] = useState<string>('Todos');
  const [selectedDate, setSelectedDate] = useState<string>('Todos');
  
  // Performance State
  const [granularity, setGranularity] = useState<'hourly' | 'daily' | null>(null);
  const [perfViewMode, setPerfViewMode] = useState<'performance' | 'leaders' | 'indirects'>('performance');
  const [perfResults, setPerfResults] = useState<PerformanceRow[] | null>(null);
  const [perfLeaders, setPerfLeaders] = useState<LeaderStat[]>([]);
  const [perfIndirects, setPerfIndirects] = useState<PerformanceRow[]>([]);

  // Setup State
  const [setupViewMode, setSetupViewMode] = useState<'fast_start' | 'strong_finish' | 'leaders'>('fast_start');
  const [setupResults, setSetupResults] = useState<SetupResults | null>(null);

  // Lunch State
  const [lunchViewMode, setLunchViewMode] = useState<'catraca' | 'retorno' | 'total' | 'leaders'>('catraca');
  const [lunchResults, setLunchResults] = useState<LunchResults | null>(null);

  // Refs
  const logoInputRef = useRef<HTMLInputElement>(null);

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

  const secondsToTime = (seconds: number): string => {
    const absSeconds = Math.abs(seconds);
    const h = Math.floor(absSeconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((absSeconds % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor(absSeconds % 60).toString().padStart(2, '0');
    return `${seconds < 0 ? '-' : ''}${h}:${m}:${s}`;
  };

  const parseBrazilianNumber = (numStr: string): number => {
    if (!numStr) return 0;
    if (typeof numStr === 'number') return numStr;
    const cleanStr = numStr.replace(/\./g, '').replace(',', '.').replace('%', '');
    return parseFloat(cleanStr) || 0;
  };

  const parseDate = (dateStr: string): Date | null => {
    if (!dateStr) return null;
    const cleanStr = dateStr.replace(/"/g, '').trim();
    let d: Date | null = null;

    // Attempt 1: Standard ISO with Space fix (YYYY-MM-DD HH:mm:ss)
    if (cleanStr.match(/^\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2}:\d{2})?$/)) {
       d = new Date(cleanStr.replace(' ', 'T'));
       if (!isNaN(d.getTime())) return d;
    }
    
    // Attempt 1.1: Standard JS parsing
    d = new Date(cleanStr);
    if (!isNaN(d.getTime())) return d;

    // Attempt 2: PT-BR Written
    const monthMap: {[key: string]: number} = {
        'jan': 0, 'fev': 1, 'mar': 2, 'abr': 3, 'mai': 4, 'jun': 5,
        'jul': 6, 'ago': 7, 'set': 8, 'out': 9, 'nov': 10, 'dez': 11
    };
    const writtenMatch = cleanStr.match(/^(\d{1,2})\s+de\s+([a-zç]{3})\.?\s+de\s+(\d{4})(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/i);
    if (writtenMatch) {
        const day = parseInt(writtenMatch[1], 10);
        const monthStr = writtenMatch[2].toLowerCase();
        const year = parseInt(writtenMatch[3], 10);
        const hour = writtenMatch[4] ? parseInt(writtenMatch[4], 10) : 0;
        const min = writtenMatch[5] ? parseInt(writtenMatch[5], 10) : 0;
        const sec = writtenMatch[6] ? parseInt(writtenMatch[6], 10) : 0;

        if (monthMap.hasOwnProperty(monthStr)) {
            d = new Date(year, monthMap[monthStr], day, hour, min, sec);
            if (!isNaN(d.getTime())) return d;
        }
    }

    // Attempt 3: PT-BR Numeric
    const ptBrMatch = cleanStr.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (ptBrMatch) {
        const day = parseInt(ptBrMatch[1], 10);
        const month = parseInt(ptBrMatch[2], 10) - 1;
        const year = parseInt(ptBrMatch[3], 10);
        const hour = ptBrMatch[4] ? parseInt(ptBrMatch[4], 10) : 0;
        const min = ptBrMatch[5] ? parseInt(ptBrMatch[5], 10) : 0;
        const sec = ptBrMatch[6] ? parseInt(ptBrMatch[6], 10) : 0;
        d = new Date(year, month, day, hour, min, sec);
        if (!isNaN(d.getTime())) return d;
    }
    return null;
  };

  const getDifferenceInSeconds = (dateA: Date, dateB: Date): number => {
    if (!dateA || !dateB) return 0;
    const diffMs = dateA.getTime() - dateB.getTime(); 
    return Math.floor(diffMs / 1000);
  };

  const getDifferenceInMinutes = (dateA: Date, dateB: Date): number => {
    if (!dateA || !dateB) return 0;
    const diffMs = dateA.getTime() - dateB.getTime(); 
    return Math.floor(diffMs / 60000);
  };

  // --- FILTER LOGIC ---

  const availableDates = useMemo(() => {
    if (!fileData) return [];
    const dates = new Set<string>();
    fileData.forEach(row => { if (row.periodo) dates.add(row.periodo); });
    return Array.from(dates).sort();
  }, [fileData]);

  const availableLeaders = useMemo(() => {
    if (!fileData) return [];
    const leaders = new Set<string>();
    fileData.forEach(row => {
      if (selectedDate !== 'Todos' && row.periodo !== selectedDate) return;
      if (row.teamLeader) leaders.add(row.teamLeader);
    });
    return Array.from(leaders).sort();
  }, [fileData, selectedDate]);

  const availableCollaborators = useMemo(() => {
    if (!fileData) return [];
    const colabs = new Set<string>();
    fileData.forEach(row => {
      if (selectedDate !== 'Todos' && row.periodo !== selectedDate) return;
      if (selectedLeader !== 'Todos' && row.teamLeader !== selectedLeader) return;
      if (row.nome) colabs.add(row.nome);
    });
    return Array.from(colabs).sort();
  }, [fileData, selectedLeader, selectedDate]);

  const applyFilters = <T extends { teamLeader: string, nome: string }>(list: T[]) => {
    return list.filter(item => {
      const leaderMatch = selectedLeader === 'Todos' || item.teamLeader === selectedLeader;
      const colabMatch = selectedCollaborator === 'Todos' || item.nome === selectedCollaborator;
      return leaderMatch && colabMatch;
    });
  };

  useEffect(() => {
    if (!fileData) return;
    if (appMode === 'performance' && granularity) {
        runPerformanceAnalysis(granularity);
    } else if (appMode === 'setup') {
        analyzeSetup(fileData);
    } else if (appMode === 'lunch') {
        analyzeLunch(fileData);
    }
  }, [selectedDate]);

  // --- HANDLERS ---

  const handleLogoUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setLogoUrl(url);
    }
  };

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
          const parsed = parsePerformanceCSV(text);
          if (parsed) { setFileData(parsed); setProcessing(false); }
        } else if (appMode === 'setup') {
          const parsed = parseSetupCSV(text);
          if (parsed) { 
              setFileData(parsed); 
              analyzeSetup(parsed); 
              setProcessing(false); 
          }
        } else {
          const parsed = parseLunchCSV(text);
          if (parsed) {
              setFileData(parsed); 
              analyzeLunch(parsed);
              setProcessing(false);
          }
        }
      }
    };
    reader.readAsText(file);
  };

  // --- PARSERS ---

  const parsePerformanceCSV = (text: string) => {
    try {
      const lines = text.split('\n').filter(line => line.trim() !== '');
      const IDX_PERIODO = 0; const IDX_NOME = 1; const IDX_TEAM_LEADER = 2; const IDX_META = 3;
      const IDX_PROD_LIQ = 7; const IDX_TEMPO_PROC = 11; const IDX_UNIDADES = 18; const MIN_COLS = 12; 

      const parsedData: PerformanceRow[] = lines.slice(1).map((line, index) => {
        const cols = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
        if (cols.length < MIN_COLS) return null;
        const cleanCol = (val: string) => val ? val.trim().replace(/^"|"$/g, '') : '';

        const periodo = cleanCol(cols[IDX_PERIODO]);
        const nome = cleanCol(cols[IDX_NOME]);
        const teamLeader = cleanCol(cols[IDX_TEAM_LEADER]);
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

        return { id: index, periodo, nome, teamLeader, meta, prodLiq, tempoProcRaw, tempoProcSec, unidades, isIndirect, isOffender };
      }).filter((item): item is PerformanceRow => item !== null);

      if (parsedData.length === 0) { alert("Nenhum dado válido."); return null; }
      return parsedData;
    } catch (error) { console.error(error); alert("Erro crítico ao processar."); return null; }
  };

  const parseSetupCSV = (text: string) => {
    try {
      const lines = text.split('\n').filter(line => line.trim() !== '');
      const headerLine = lines[0];
      const headers = headerLine.split(',').map(h => h.trim().replace(/^"|"$/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, "").toUpperCase());
      const findIndex = (keywords: string[]) => headers.findIndex(h => keywords.some(k => h.includes(k)));

      const IDX_PERIODO = 0; 
      const IDX_NOME = findIndex(['NOME']); 
      const IDX_LEADER = findIndex(['TL', 'TEAM LEADER', 'LIDER']);
      const IDX_CLOCK_IN = findIndex(['CLOCK IN']); 
      const IDX_PRIMEIRO_BIP = findIndex(['PRIMEIRO BIP']);
      const IDX_TEMPO_BIP_ENTRADA = findIndex(['TEMPO DE BIP ENTRADA']);
      
      // CORREÇÃO: Busca exata ou que NÃO contenha PENULTIMO/DIFF
      const IDX_ULTIMO_BIP = headers.findIndex(h => h.includes('ULTIMO BIP') && !h.includes('PENULTIMO') && !h.includes('DIFF'));
      
      const IDX_TARGET_SAIDA = findIndex(['DATETIME TARGET SAIDA', 'TARGET SAIDA']); 
      const IDX_CLOCK_OUT = findIndex(['CLOCK OUT']);

      if (IDX_NOME === -1 || IDX_TEMPO_BIP_ENTRADA === -1) { alert("Erro: Colunas obrigatórias não encontradas."); return null; }

      const parsedData: SetupRow[] = lines.slice(1).map((line, index) => {
        const cols = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
        const maxIndex = Math.max(IDX_NOME, IDX_LEADER, IDX_CLOCK_IN, IDX_PRIMEIRO_BIP, IDX_TEMPO_BIP_ENTRADA, IDX_ULTIMO_BIP, IDX_TARGET_SAIDA, IDX_CLOCK_OUT);
        if (cols.length <= maxIndex) return null;

        const cleanCol = (idx: number) => (idx !== -1 && cols[idx]) ? cols[idx].trim().replace(/^"|"$/g, '') : '';
        const periodo = cleanCol(IDX_PERIODO); const nome = cleanCol(IDX_NOME); const teamLeader = cleanCol(IDX_LEADER);
        const clockIn = cleanCol(IDX_CLOCK_IN); const primeiroBip = cleanCol(IDX_PRIMEIRO_BIP);
        const tempoBipEntrada = cleanCol(IDX_TEMPO_BIP_ENTRADA); const tempoBipEntradaSec = timeToSeconds(tempoBipEntrada);
        const ultimoBipRaw = cleanCol(IDX_ULTIMO_BIP); const targetSaidaRaw = cleanCol(IDX_TARGET_SAIDA); const clockOutRaw = cleanCol(IDX_CLOCK_OUT);

        const isFastStartOffender = tempoBipEntradaSec > 900;
        let isStrongFinishOffender = false; let sfReason = ''; let diffExitSec = 0;

        const dateUltimo = parseDate(ultimoBipRaw);
        const dateTarget = parseDate(targetSaidaRaw);
        const dateClockOut = parseDate(clockOutRaw);

        if (dateUltimo && dateTarget) {
            const diffEarlySec = getDifferenceInSeconds(dateTarget, dateUltimo);
            diffExitSec = diffEarlySec; 
            if (diffEarlySec > 300) { isStrongFinishOffender = true; sfReason = 'Parou muito cedo (>5min)'; }
            else if (dateClockOut) {
                const diffMins = getDifferenceInMinutes(dateClockOut, dateUltimo);
                if (diffMins > 5) { isStrongFinishOffender = true; sfReason = 'Demora na saída (>5min)'; }
            }
        }

        return { id: index, periodo, nome, teamLeader, clockIn, primeiroBip, tempoBipEntrada, tempoBipEntradaSec, isFastStartOffender, ultimoBipRaw, targetSaidaRaw, clockOutRaw, isStrongFinishOffender, sfReason, diffExitSec };
      }).filter((item): item is SetupRow => item !== null);

      if (parsedData.length === 0) { alert("Nenhum dado válido."); return null; }
      return parsedData;
    } catch (error) { console.error(error); alert("Erro ao processar."); return null; }
  };

  const parseLunchCSV = (text: string) => {
    try {
      const lines = text.split('\n').filter(line => line.trim() !== '');
      const IDX_PERIODO = 0; const IDX_TL = 3; const IDX_NOME = 4; const IDX_TEMPO_CATRACA = 7;
      const IDX_SAIDA_BIP = 11; const IDX_SAIDA_CATRACA = 12; const IDX_RETORNO_CATRACA = 13; const IDX_RETORNO_BIP = 14;

      const parsedData: LunchRow[] = lines.slice(1).map((line, index) => {
        const cols = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
        if (cols.length < 15) return null;
        const cleanCol = (val: string) => val ? val.trim().replace(/^"|"$/g, '') : '';

        const periodo = cleanCol(cols[IDX_PERIODO]); const nome = cleanCol(cols[IDX_NOME]); const teamLeader = cleanCol(cols[IDX_TL]);
        const tempoCatracaRaw = cleanCol(cols[IDX_TEMPO_CATRACA]); const tempoCatracaSec = timeToSeconds(tempoCatracaRaw);
        const saidaBip = cleanCol(cols[IDX_SAIDA_BIP]); const saidaCatraca = cleanCol(cols[IDX_SAIDA_CATRACA]);
        const retornoCatraca = cleanCol(cols[IDX_RETORNO_CATRACA]); const retornoBip = cleanCol(cols[IDX_RETORNO_BIP]);

        const isCatracaOffender = tempoCatracaSec > 3630;
        let diffRetornoSec = 0; let totalIntervalSec = 0; let isRetornoOffender = false; let isTotalIntervalOffender = false;
        
        const dateSaidaBip = parseDate(saidaBip);
        const dateRetornoCatraca = parseDate(retornoCatraca);
        const dateRetornoBip = parseDate(retornoBip);

        if (dateRetornoCatraca && dateRetornoBip) {
            diffRetornoSec = getDifferenceInSeconds(dateRetornoBip, dateRetornoCatraca);
            if (diffRetornoSec > 600) { isRetornoOffender = true; }
        }
        if (dateSaidaBip && dateRetornoBip) {
            totalIntervalSec = getDifferenceInSeconds(dateRetornoBip, dateSaidaBip);
            if (totalIntervalSec > 4200) { isTotalIntervalOffender = true; }
        }

        return { id: index, periodo, nome, teamLeader, tempoCatracaRaw, tempoCatracaSec, saidaCatraca, retornoCatraca, isCatracaOffender, saidaBip, retornoBip, diffRetornoSec, diffRetornoFormatted: secondsToTime(diffRetornoSec), isRetornoOffender, totalIntervalSec, totalIntervalFormatted: secondsToTime(totalIntervalSec), isTotalIntervalOffender };
      }).filter((item): item is LunchRow => item !== null);

      if (parsedData.length === 0) { alert("Nenhum dado válido."); return null; }
      return parsedData;
    } catch (e) { console.error(e); alert("Erro ao processar."); return null; }
  }

  // --- ANALYSIS LOGIC ---

  const runPerformanceAnalysis = (mode: 'hourly' | 'daily') => {
    setGranularity(mode);
    if (!fileData) return;
    
    let data = fileData as PerformanceRow[];
    if (selectedDate !== 'Todos') {
        data = data.filter(r => r.periodo === selectedDate);
    }

    const indirects = data.filter(row => row.isIndirect);
    setPerfIndirects(indirects);

    const users: Record<string, PerformanceRow> = {};
    const leadersStats: Record<string, { totalImpact: number, totalRows: number, sumProd: number, offendersSet: Set<string>, allPeopleSet: Set<string> }> = {};

    data.forEach(row => {
      if (row.isIndirect) return;
      if (!users[row.nome]) { users[row.nome] = { ...row, totalRows: 0, totalOffenses: 0, history: [] }; }
      const user = users[row.nome];
      if (user.totalRows !== undefined) user.totalRows++;
      
      if (row.teamLeader) {
          if (!leadersStats[row.teamLeader]) { leadersStats[row.teamLeader] = { totalImpact: 0, totalRows: 0, sumProd: 0, offendersSet: new Set(), allPeopleSet: new Set() }; }
          const stats = leadersStats[row.teamLeader];
          stats.totalRows++;
          stats.sumProd += row.prodLiq || 0; 
          stats.allPeopleSet.add(row.nome);
          if (row.isOffender) { stats.totalImpact++; stats.offendersSet.add(row.nome); }
      }

      if (row.isOffender) {
        if (user.totalOffenses !== undefined) user.totalOffenses++;
      }
      user.history?.push(row);
    });

    const rankingUsers = Object.values(users).map(user => {
      let maxStreak = 0; let currentStreak = 0;
      user.history?.forEach(row => {
        if (row.isOffender) currentStreak++;
        else { if (currentStreak > maxStreak) maxStreak = currentStreak; currentStreak = 0; }
      });
      if (currentStreak > maxStreak) maxStreak = currentStreak;
      const totalOffenses = user.totalOffenses || 0; const totalRows = user.totalRows || 0;
      return { ...user, maxStreak, offenseRate: totalRows > 0 ? (totalOffenses / totalRows) * 100 : 0 };
    }).filter(u => (u.totalOffenses || 0) > 0); 

    rankingUsers.sort((a, b) => (b.totalOffenses || 0) - (a.totalOffenses || 0));

    const rankingLeaders: LeaderStat[] = Object.entries(leadersStats).map(([name, stats]) => ({
            name, count: 0, totalImpact: stats.totalImpact, totalRows: stats.totalRows, totalPeople: stats.allPeopleSet.size,
            offensePercentage: stats.allPeopleSet.size > 0 ? (stats.offendersSet.size / stats.allPeopleSet.size) * 100 : 0,
            uniqueOffenders: stats.offendersSet.size, avgProd: stats.totalRows > 0 ? (stats.sumProd / stats.totalRows) : 0
        })).filter(l => (l.totalImpact || 0) > 0).sort((a, b) => (b.uniqueOffenders || 0) - (a.uniqueOffenders || 0));

    setPerfResults(rankingUsers); setPerfLeaders(rankingLeaders);
  };

  const analyzeSetup = (rawData: SetupRow[]) => {
      let data = rawData;
      if (selectedDate !== 'Todos') {
          data = data.filter(r => r.periodo === selectedDate);
      }

      const fsOffenders = data.filter(d => d.isFastStartOffender);
      const sfOffenders = data.filter(d => d.isStrongFinishOffender);
      
      const leadersStats: Record<string, { totalImpact: number, totalRows: number, offendersSet: Set<string>, allPeopleSet: Set<string>, sumFirstBip: number, countFirstBip: number, sumExitDiff: number, countExitDiff: number }> = {};

      data.forEach(row => {
          if (!row.teamLeader) return;
          if (!leadersStats[row.teamLeader]) { leadersStats[row.teamLeader] = { totalImpact: 0, totalRows: 0, offendersSet: new Set(), allPeopleSet: new Set(), sumFirstBip: 0, countFirstBip: 0, sumExitDiff: 0, countExitDiff: 0 }; }
          const stats = leadersStats[row.teamLeader];
          stats.totalRows++; stats.allPeopleSet.add(row.nome);
          
          if (row.tempoBipEntradaSec > 0) { stats.sumFirstBip += row.tempoBipEntradaSec; stats.countFirstBip++; }
          if (row.diffExitSec !== 0) { stats.sumExitDiff += row.diffExitSec; stats.countExitDiff++; }
          if (row.isFastStartOffender || row.isStrongFinishOffender) { stats.totalImpact++; stats.offendersSet.add(row.nome); }
      });

      const leaderRanking: LeaderStat[] = Object.entries(leadersStats).map(([name, stats]) => ({
          name, count: 0, totalImpact: stats.totalImpact, totalRows: stats.totalRows, totalPeople: stats.allPeopleSet.size,
          offensePercentage: stats.allPeopleSet.size > 0 ? (stats.offendersSet.size / stats.allPeopleSet.size) * 100 : 0,
          uniqueOffenders: stats.offendersSet.size, avgFirstBip: stats.countFirstBip > 0 ? stats.sumFirstBip / stats.countFirstBip : 0,
          avgExitDiff: stats.countExitDiff > 0 ? stats.sumExitDiff / stats.countExitDiff : 0
      })).sort((a, b) => (b.uniqueOffenders || 0) - (a.uniqueOffenders || 0));

      setSetupResults({ fastStart: fsOffenders.sort((a,b) => b.tempoBipEntradaSec - a.tempoBipEntradaSec), strongFinish: sfOffenders, leaders: leaderRanking, allRows: data });
  };

  const analyzeLunch = (rawData: LunchRow[]) => {
      let data = rawData;
      if (selectedDate !== 'Todos') {
          data = data.filter(r => r.periodo === selectedDate);
      }

      const catracaOffenders = data.filter(d => d.isCatracaOffender);
      const retornoOffenders = data.filter(d => d.isRetornoOffender);
      const totalIntervalOffenders = data.filter(d => d.isTotalIntervalOffender);
      
      const leadersStats: Record<string, { totalImpact: number, totalRows: number, offendersSet: Set<string>, allPeopleSet: Set<string>, sumCatraca: number, countCatraca: number, sumRetorno: number, countRetorno: number }> = {};

      data.forEach(row => {
          if (!row.teamLeader) return;
          if (!leadersStats[row.teamLeader]) { leadersStats[row.teamLeader] = { totalImpact: 0, totalRows: 0, offendersSet: new Set(), allPeopleSet: new Set(), sumCatraca: 0, countCatraca: 0, sumRetorno: 0, countRetorno: 0 }; }
          const stats = leadersStats[row.teamLeader];
          stats.totalRows++; stats.allPeopleSet.add(row.nome);
          
          if (row.tempoCatracaSec > 0) { stats.sumCatraca += row.tempoCatracaSec; stats.countCatraca++; }
          if (row.diffRetornoSec > 0) { stats.sumRetorno += row.diffRetornoSec; stats.countRetorno++; }
          if (row.isCatracaOffender || row.isRetornoOffender || row.isTotalIntervalOffender) { stats.totalImpact++; stats.offendersSet.add(row.nome); }
      });

      const leaderRanking: LeaderStat[] = Object.entries(leadersStats).map(([name, stats]) => ({
          name, count: 0, totalImpact: stats.totalImpact, totalRows: stats.totalRows, totalPeople: stats.allPeopleSet.size,
          offensePercentage: stats.allPeopleSet.size > 0 ? (stats.offendersSet.size / stats.allPeopleSet.size) * 100 : 0,
          uniqueOffenders: stats.offendersSet.size, avgCatraca: stats.countCatraca > 0 ? stats.sumCatraca / stats.countCatraca : 0,
          avgRetorno: stats.countRetorno > 0 ? stats.sumRetorno / stats.countRetorno : 0
      })).sort((a, b) => (b.uniqueOffenders || 0) - (a.uniqueOffenders || 0));

      setLunchResults({ catraca: catracaOffenders.sort((a,b) => b.tempoCatracaSec - a.tempoCatracaSec), retorno: retornoOffenders.sort((a,b) => b.diffRetornoSec - a.diffRetornoSec), totalInterval: totalIntervalOffenders.sort((a,b) => b.totalIntervalSec - a.totalIntervalSec), leaders: leaderRanking, allRows: data });
  };

  const reset = () => {
    setFileData(null); setFileName(''); setPerfResults(null); setSetupResults(null); setLunchResults(null);
    setPerfLeaders([]); setPerfIndirects([]); setGranularity(null); setDebugMode(false);
    setSelectedLeader('Todos'); setSelectedCollaborator('Todos'); setSelectedDate('Todos');
    setPerfViewMode('performance'); setSetupViewMode('fast_start'); setLunchViewMode('catraca'); setAppMode(null); 
  };
  const softReset = () => { setFileData(null); setFileName(''); setPerfResults(null); setSetupResults(null); setLunchResults(null); setSelectedLeader('Todos'); setSelectedCollaborator('Todos'); setSelectedDate('Todos'); }
  const GlobalStyle = () => ( <style>{` html, body { margin: 0; padding: 0; width: 100%; height: 100%; background-color: #f8fafc; } #root { width: 100%; height: 100%; } `}</style> );

  // --- RENDER ---

  if (!appMode) {
      return (
        <div className="min-h-screen w-full bg-slate-50 flex items-center justify-center p-4">
            <GlobalStyle />
            <div className="w-full">
                {/* Header with Logo on Home */}
                <div className="flex items-center justify-center mb-12 gap-4">
                    <div className="relative group">
                        <input 
                            type="file" 
                            ref={logoInputRef}
                            accept="image/*" 
                            onChange={handleLogoUpload} 
                            className="hidden"
                        />
                        <div 
                            className="w-24 h-24 rounded-xl bg-white border border-slate-200 flex items-center justify-center overflow-hidden cursor-pointer hover:border-blue-400 transition-colors shadow-sm"
                            onClick={() => logoInputRef.current?.click()}
                            title="Clique para adicionar logo"
                        >
                            {logoUrl ? (
                                <img src={logoUrl} alt="Logo Empresa" className="w-full h-full object-contain" />
                            ) : (
                                <ImageIcon className="text-slate-300" size={32} />
                            )}
                        </div>
                    </div>
                    <div className="text-left">
                        <h1 className="text-4xl font-bold text-slate-800 mb-2">Portal de Análise Operacional</h1>
                        <p className="text-slate-500">Selecione o indicador que deseja analisar hoje</p>
                    </div>
                </div>
                
                <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
                    <button onClick={() => setAppMode('performance')} className="bg-white p-6 rounded-2xl shadow-sm border-2 border-transparent hover:border-blue-500 hover:shadow-xl transition-all text-left group">
                        <div className="w-14 h-14 bg-blue-100 rounded-2xl flex items-center justify-center text-blue-600 mb-4 group-hover:scale-110 transition-transform"><BarChart2 size={28} /></div>
                        <h2 className="text-xl font-bold text-slate-800 mb-2">Performance</h2>
                        <p className="text-slate-500 text-sm mb-4">Meta vs Realizado, gargalos e indiretos.</p>
                        <span className="text-blue-600 font-bold flex items-center gap-2 text-sm">Acessar <ArrowRight size={14}/></span>
                    </button>

                    <button onClick={() => setAppMode('setup')} className="bg-white p-6 rounded-2xl shadow-sm border-2 border-transparent hover:border-purple-500 hover:shadow-xl transition-all text-left group">
                        <div className="w-14 h-14 bg-purple-100 rounded-2xl flex items-center justify-center text-purple-600 mb-4 group-hover:scale-110 transition-transform"><Timer size={28} /></div>
                        <h2 className="text-xl font-bold text-slate-800 mb-2">Setup Time</h2>
                        <p className="text-slate-500 text-sm mb-4">Fast Start e Strong Finish (Pontualidade).</p>
                        <span className="text-purple-600 font-bold flex items-center gap-2 text-sm">Acessar <ArrowRight size={14}/></span>
                    </button>

                    <button onClick={() => setAppMode('lunch')} className="bg-white p-6 rounded-2xl shadow-sm border-2 border-transparent hover:border-orange-500 hover:shadow-xl transition-all text-left group">
                        <div className="w-14 h-14 bg-orange-100 rounded-2xl flex items-center justify-center text-orange-600 mb-4 group-hover:scale-110 transition-transform"><Coffee size={28} /></div>
                        <h2 className="text-xl font-bold text-slate-800 mb-2">Intervalo & Catraca</h2>
                        <p className="text-slate-500 text-sm mb-4">Tempo excedido de pausa e atraso no retorno.</p>
                        <span className="text-orange-600 font-bold flex items-center gap-2 text-sm">Acessar <ArrowRight size={14}/></span>
                    </button>
                </div>
            </div>
        </div>
      );
  }

  return (
    <div className="min-h-screen w-full bg-slate-50 text-slate-800 font-sans p-4 md:p-8">
      <GlobalStyle />
      <div className="w-full">
        
        {/* Header */}
        <header className="mb-8 border-b border-slate-200 pb-4 flex flex-col md:flex-row justify-between items-center w-full gap-4">
          <div className="flex items-center gap-4">
             {/* LOGO AREA (Smaller in dashboard) */}
             <div className="relative group">
                 <input 
                    type="file" 
                    ref={logoInputRef}
                    accept="image/*" 
                    onChange={handleLogoUpload} 
                    className="hidden"
                 />
                 <div 
                    className="w-14 h-14 rounded-lg bg-white border border-slate-200 flex items-center justify-center overflow-hidden cursor-pointer hover:border-blue-400 transition-colors"
                    onClick={() => logoInputRef.current?.click()}
                    title="Clique para alterar logo"
                 >
                     {logoUrl ? (
                         <img src={logoUrl} alt="Logo" className="w-full h-full object-contain" />
                     ) : (
                         <ImageIcon className="text-slate-300" size={20} />
                     )}
                 </div>
             </div>

             <div>
                <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
                    {appMode === 'performance' ? <BarChart2 className="text-blue-600" /> : appMode === 'setup' ? <Timer className="text-purple-600" /> : <Coffee className="text-orange-600" />}
                    {appMode === 'performance' ? 'Performance' : appMode === 'setup' ? 'Setup Time' : 'Intervalo & Catraca'}
                </h1>
                <p className="text-slate-500 mt-1 text-sm">
                    {appMode === 'performance' ? 'Gargalos de meta e indiretos.' : appMode === 'setup' ? 'Fast Start e Strong Finish.' : 'Controle de pausa e retorno operacional.'}
                </p>
             </div>
          </div>
          
          <div className="flex gap-4 items-center">
             {/* --- FILTROS GLOBAIS --- */}
             {fileData && (
                <div className="flex gap-2 items-center bg-white border border-slate-200 p-1 rounded-lg shadow-sm">
                    <div className="flex items-center px-2 text-slate-400"><Filter size={16}/></div>
                    
                    {/* Date Filter */}
                    <div className="flex items-center px-2 text-slate-400 border-r border-slate-100"><Calendar size={16}/></div>
                    <select 
                        value={selectedDate} 
                        onChange={(e) => { setSelectedDate(e.target.value); }}
                        className="bg-transparent text-sm p-2 outline-none border-r border-slate-100 min-w-[120px]"
                    >
                        <option value="Todos">Todas as Datas</option>
                        {availableDates.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>

                    <select 
                        value={selectedLeader} 
                        onChange={(e) => { setSelectedLeader(e.target.value); setSelectedCollaborator('Todos'); }}
                        className="bg-transparent text-sm p-2 outline-none border-r border-slate-100 min-w-[150px]"
                    >
                        <option value="Todos">Todos os Leaders</option>
                        {availableLeaders.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                    <select 
                        value={selectedCollaborator} 
                        onChange={(e) => setSelectedCollaborator(e.target.value)}
                        className="bg-transparent text-sm p-2 outline-none min-w-[150px]"
                    >
                        <option value="Todos">Todos Colaboradores</option>
                        {availableCollaborators.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
             )}

             <button onClick={reset} className="text-slate-500 hover:text-slate-800 font-medium text-sm flex items-center gap-1 bg-slate-100 px-3 py-2 rounded-lg">
                <Settings size={14} /> Sair
             </button>
          </div>
        </header>

        {/* --- UPLOAD SECTION --- */}
        {!fileData && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center max-w-4xl mx-auto">
            <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 ${appMode === 'performance' ? 'bg-blue-50 text-blue-500' : appMode === 'setup' ? 'bg-purple-50 text-purple-500' : 'bg-orange-50 text-orange-500'}`}>
              <Upload className="w-10 h-10" />
            </div>
            <h2 className="text-xl font-semibold mb-2">
                Upload Base de {appMode === 'performance' ? 'Performance' : appMode === 'setup' ? 'Setup Time' : 'Intervalo'}
            </h2>
            <p className="text-slate-400 mb-6 max-w-lg mx-auto text-sm">
              {appMode === 'performance' ? (
                  <>Colunas: Período, Nome, Leader, Meta, Prod, Tempo, Unidades.</>
              ) : appMode === 'setup' ? (
                  <>Colunas: Nome, Leader, Clock In, 1º Bip, Tempo Entrada, Último Bip, Target Saída, Clock Out.</>
              ) : (
                  <>Colunas: TL, Representante, Tempo Catraca, Saída/Retorno Catraca, Retorno BIP.</>
              )}
            </p>
            <input type="file" accept=".csv,.txt" onChange={handleFileUpload} className="hidden" id="csvUpload"/>
            <label htmlFor="csvUpload" className={`inline-flex items-center gap-2 px-6 py-3 text-white font-medium rounded-lg cursor-pointer transition-colors ${appMode === 'performance' ? 'bg-blue-600 hover:bg-blue-700' : appMode === 'setup' ? 'bg-purple-600 hover:bg-purple-700' : 'bg-orange-600 hover:bg-orange-700'}`}>
              <FileText size={20} /> Selecionar CSV
            </label>
            {processing && <p className="mt-4 text-slate-400 animate-pulse">Processando dados...</p>}
          </div>
        )}

        {/* --- PERFORMANCE DASHBOARD --- */}
        {fileData && appMode === 'performance' && (
            <div className="space-y-6 w-full">
                {!perfResults ? (
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 max-w-4xl mx-auto">
                        <div className="flex items-center justify-between mb-8">
                            <h2 className="text-xl font-bold flex items-center gap-2"><CheckCircle className="text-green-500"/> Arquivo Carregado</h2>
                            <div className="flex gap-4">
                                <button onClick={() => setDebugMode(!debugMode)} className="flex items-center gap-2 text-slate-500 hover:text-blue-600 text-sm"><Eye size={16} /> Diag</button>
                                <button onClick={softReset} className="text-red-500 text-sm">Cancelar</button>
                            </div>
                        </div>
                        {debugMode && (
                          <div className="mb-8 p-4 bg-slate-100 rounded-lg overflow-x-auto">
                            <table className="w-full text-xs text-left bg-white rounded border border-slate-300">
                              <thead className="bg-slate-200"><tr><th className="p-2 border">Período</th><th className="p-2 border">Colab</th><th className="p-2 border">Leader</th><th className="p-2 border">Meta</th><th className="p-2 border">Status</th></tr></thead>
                              <tbody>{fileData.slice(0, 3).map((row: PerformanceRow, i) => (<tr key={i}><td className="p-2 border">{row.periodo}</td><td className="p-2 border">{row.nome}</td><td className="p-2 border">{row.teamLeader}</td><td className="p-2 border">{row.meta}</td><td className="p-2 border">{row.isOffender ? 'NOK' : 'OK'}</td></tr>))}</tbody>
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
                    <>
                        <div className="flex border-b border-slate-200 gap-2">
                            <button onClick={() => setPerfViewMode('performance')} className={`px-6 py-3 font-medium text-sm border-b-2 ${perfViewMode === 'performance' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500'}`}>Performance</button>
                            <button onClick={() => setPerfViewMode('leaders')} className={`px-6 py-3 font-medium text-sm border-b-2 flex items-center gap-2 ${perfViewMode === 'leaders' ? 'border-purple-500 text-purple-600' : 'border-transparent text-slate-500'}`}><BarChart size={16}/> Visão de Líderes</button>
                            <button onClick={() => setPerfViewMode('indirects')} className={`px-6 py-3 font-medium text-sm border-b-2 ${perfViewMode === 'indirects' ? 'border-orange-500 text-orange-600' : 'border-transparent text-slate-500'}`}>Indiretos ({perfIndirects.length})</button>
                        </div>
                        
                        {/* VIEW: PERFORMANCE (INDIVIDUAL) */}
                        {perfViewMode === 'performance' && (
                            <>
                                <div className="flex justify-between items-center bg-white p-4 rounded-lg border border-slate-200 w-full">
                                    <div className="flex gap-2"><span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-xs font-bold uppercase">{granularity}</span></div>
                                    <button onClick={softReset} className="flex items-center gap-2 text-slate-600 hover:text-slate-900 text-sm"><RefreshCcw size={14}/> Resetar</button>
                                </div>
                                {perfLeaders.length > 0 && (
                                    <div className="bg-slate-800 text-white rounded-xl p-6 shadow-lg w-full">
                                        <h3 className="text-sm font-bold uppercase text-slate-400 mb-4 flex items-center gap-2"><ShieldAlert size={16}/> Top Team Leaders (Impacto Total)</h3>
                                        <div className="grid md:grid-cols-3 gap-4">{perfLeaders.slice(0,3).map((l, i) => (<div key={i} className="bg-slate-700/50 p-3 rounded border border-slate-600 flex justify-between"><span className="font-medium truncate pr-2">{l.name}</span><span className="bg-red-500 text-xs font-bold px-2 py-1 rounded">{l.totalImpact}</span></div>))}</div>
                                    </div>
                                )}
                                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden w-full">
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-slate-100 text-slate-600"><tr><th className="px-6 py-3">Colaborador</th><th className="px-6 py-3">Leader</th><th className="px-6 py-3 text-center">Maior Seq.</th><th className="px-6 py-3 text-center">Falhas</th></tr></thead>
                                        <tbody className="divide-y divide-slate-100">{applyFilters(perfResults).map((u, i) => (<tr key={i} className="hover:bg-slate-50"><td className="px-6 py-4 font-medium">{u.nome}</td><td className="px-6 py-4 text-slate-500">{u.teamLeader}</td><td className="px-6 py-4 text-center"><span className="bg-red-100 text-red-700 px-2 py-1 rounded font-bold">{u.maxStreak}</span></td><td className="px-6 py-4 text-center font-bold">{u.totalOffenses}</td></tr>))}</tbody>
                                    </table>
                                </div>
                            </>
                        )}

                        {/* VIEW: LEADERS (ANALYSIS) */}
                        {perfViewMode === 'leaders' && (
                            <div className="space-y-6">
                                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm w-full">
                                    <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2"><Percent size={20} className="text-purple-500"/> Ranking por % do Time</h3>
                                    <div className="space-y-4">
                                        {[...perfLeaders].sort((a,b) => (b.offensePercentage || 0) - (a.offensePercentage || 0)).slice(0, 5).map((l, i) => {
                                            return (
                                                <div key={i}>
                                                    <div className="flex justify-between text-xs mb-1">
                                                        <span className="font-medium text-slate-700 truncate w-40">{l.name}</span>
                                                        <span className="font-bold text-slate-900">{(l.offensePercentage || 0).toFixed(1)}%</span>
                                                    </div>
                                                    <div className="w-full bg-slate-100 rounded-full h-2.5">
                                                        <div className="bg-purple-500 h-2.5 rounded-full transition-all duration-500" style={{width: `${l.offensePercentage}%`}}></div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden w-full">
                                    <div className="p-4 border-b border-slate-100 bg-slate-50 font-bold text-slate-700 flex justify-between">
                                        <span>Detalhamento dos Líderes</span>
                                        <span className="text-xs text-slate-400 font-normal self-center">Ordenado por Pessoas Ofensoras</span>
                                    </div>
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-slate-100 text-slate-600">
                                            <tr>
                                                <th className="px-6 py-3">Team Leader</th>
                                                <th className="px-6 py-3 text-center">Total Pessoas</th>
                                                <th className="px-6 py-3 text-center bg-blue-50 text-blue-800">Pessoas Ofensoras</th>
                                                <th className="px-6 py-3 text-center">Total de Falhas</th>
                                                <th className="px-6 py-3 text-center bg-green-50 text-green-800">Média Prod.</th>
                                                <th className="px-6 py-3 text-center">% Impacto</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {perfLeaders.map((l, i) => (
                                                <tr key={i} className="hover:bg-slate-50">
                                                    <td className="px-6 py-4 font-medium text-slate-800">{l.name}</td>
                                                    <td className="px-6 py-4 text-center text-slate-500">{l.totalPeople}</td>
                                                    <td className="px-6 py-4 text-center font-bold text-blue-600 bg-blue-50/30">{l.uniqueOffenders}</td>
                                                    <td className="px-6 py-4 text-center font-bold text-slate-600">{l.totalImpact}</td>
                                                    <td className="px-6 py-4 text-center font-bold text-green-600 bg-green-50/30">{(l.avgProd || 0).toFixed(2)}</td>
                                                    <td className="px-6 py-4 text-center font-bold text-slate-700">{(l.offensePercentage || 0).toFixed(1)}%</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* VIEW: INDIRECTS */}
                        {perfViewMode === 'indirects' && (
                            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden w-full">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-orange-50 text-orange-800"><tr><th className="px-6 py-3">Nome</th><th className="px-6 py-3">Leader</th><th className="px-6 py-3">Tempo</th><th className="px-6 py-3">Unidades</th></tr></thead>
                                    <tbody className="divide-y divide-slate-100">{applyFilters(perfIndirects).map((u, i) => (<tr key={i}><td className="px-6 py-3">{u.nome}</td><td className="px-6 py-3">{u.teamLeader}</td><td className="px-6 py-3">{u.tempoProcRaw}</td><td className="px-6 py-3">{u.unidades}</td></tr>))}</tbody>
                                </table>
                            </div>
                        )}
                    </>
                )}
            </div>
        )}

        {/* --- SETUP DASHBOARD --- */}
        {fileData && appMode === 'setup' && setupResults && (
            <div className="space-y-6 w-full">
                <div className="flex justify-between items-center bg-white p-4 rounded-lg border border-slate-200 shadow-sm w-full">
                    <div className="flex items-center gap-2"><span className="font-bold text-slate-700">Arquivo:</span><span className="text-slate-500 text-sm">{fileName}</span></div>
                    
                    <div className="flex gap-4">
                        <button onClick={() => setDebugMode(!debugMode)} className="flex items-center gap-2 text-slate-500 hover:text-blue-600 text-sm"><Eye size={16} /> Diag</button>
                        <button onClick={softReset} className="text-red-500 hover:text-red-700 text-sm font-medium">Trocar Arquivo</button>
                    </div>
                </div>

                {debugMode && (
                    <div className="mb-8 p-4 bg-slate-100 rounded-lg overflow-x-auto">
                    <h4 className="font-bold text-sm mb-2 text-slate-700">Diagnóstico Setup (Primeiras 3 linhas):</h4>
                    <table className="w-full text-xs text-left bg-white rounded border border-slate-300">
                        <thead className="bg-slate-200">
                        <tr>
                            <th className="p-2 border">Período</th>
                            <th className="p-2 border">Colab</th>
                            <th className="p-2 border">Último Bip</th>
                            <th className="p-2 border">Target Saída</th>
                            <th className="p-2 border">Diff Exit (s)</th>
                            <th className="p-2 border">Status</th>
                        </tr>
                        </thead>
                        <tbody>
                        {setupResults.allRows.slice(0, 3).map((row: SetupRow, i) => (
                            <tr key={i} className="border-b">
                            <td className="p-2 border">{row.periodo}</td>
                            <td className="p-2 border">{row.nome}</td>
                            <td className="p-2 border">{row.ultimoBipRaw}</td>
                            <td className="p-2 border">{row.targetSaidaRaw}</td>
                            <td className="p-2 border">{row.diffExitSec}</td>
                            <td className="p-2 border font-bold">
                                {row.isStrongFinishOffender ? <span className="text-red-600">NOK</span> : <span className="text-green-600">OK</span>}
                            </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                    </div>
                )}
                
                <div className="flex border-b border-slate-200 bg-white rounded-t-xl px-2 w-full">
                    <button onClick={() => setSetupViewMode('fast_start')} className={`px-6 py-4 font-bold text-sm border-b-2 flex items-center gap-2 transition-colors ${setupViewMode === 'fast_start' ? 'border-red-500 text-red-600 bg-red-50' : 'border-transparent text-slate-500 hover:text-slate-700'}`}><Timer size={18}/> Fast Start <span className="bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full text-xs ml-2">{applyFilters(setupResults.fastStart).length}</span></button>
                    <button onClick={() => setSetupViewMode('strong_finish')} className={`px-6 py-4 font-bold text-sm border-b-2 flex items-center gap-2 transition-colors ${setupViewMode === 'strong_finish' ? 'border-blue-500 text-blue-600 bg-blue-50' : 'border-transparent text-slate-500 hover:text-slate-700'}`}><CheckCircle size={18}/> Strong Finish <span className="bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full text-xs ml-2">{applyFilters(setupResults.strongFinish).length}</span></button>
                    <button onClick={() => setSetupViewMode('leaders')} className={`px-6 py-4 font-bold text-sm border-b-2 flex items-center gap-2 transition-colors ${setupViewMode === 'leaders' ? 'border-purple-500 text-purple-600 bg-purple-50' : 'border-transparent text-slate-500 hover:text-slate-700'}`}><BarChart size={18}/> Visão de Líderes</button>
                </div>

                {setupViewMode === 'fast_start' && (
                    <div className="bg-white rounded-b-xl shadow-sm border border-t-0 border-slate-200 overflow-hidden w-full">
                        <div className="p-4 bg-red-50 text-red-800 text-sm border-b border-red-100 flex items-center gap-2"><AlertTriangle size={16}/> Colaboradores com <strong>Tempo de Bip Entrada {'>'} 15:00</strong></div>
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-100 text-slate-600"><tr><th className="px-6 py-3">Colaborador</th><th className="px-6 py-3">Leader</th><th className="px-6 py-3">Clock In</th><th className="px-6 py-3">Primeiro Bip</th><th className="px-6 py-3 text-right">Tempo Bip Entrada</th></tr></thead>
                            <tbody className="divide-y divide-slate-100">{applyFilters(setupResults.fastStart).map((row, i) => (<tr key={i} className="hover:bg-slate-50"><td className="px-6 py-4 font-medium">{row.nome}</td><td className="px-6 py-4 text-slate-500">{row.teamLeader}</td><td className="px-6 py-4 text-slate-500 text-xs font-mono">{row.clockIn}</td><td className="px-6 py-4 text-slate-500 text-xs font-mono">{row.primeiroBip}</td><td className="px-6 py-4 text-right font-bold text-red-600 font-mono">{row.tempoBipEntrada}</td></tr>))}</tbody>
                        </table>
                    </div>
                )}
                {setupViewMode === 'strong_finish' && (
                    <div className="bg-white rounded-b-xl shadow-sm border border-t-0 border-slate-200 overflow-hidden w-full">
                        <div className="p-4 bg-blue-50 text-blue-800 text-sm border-b border-blue-100 flex items-center gap-2"><AlertTriangle size={16}/> Saída antecipada ou demorada.</div>
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-100 text-slate-600"><tr><th className="px-6 py-3">Colaborador</th><th className="px-6 py-3">Motivo</th><th className="px-6 py-3">Último Bip</th><th className="px-6 py-3">Target Saída</th><th className="px-6 py-3">Clock Out</th></tr></thead>
                            <tbody className="divide-y divide-slate-100">{applyFilters(setupResults.strongFinish).map((row, i) => (<tr key={i} className="hover:bg-slate-50"><td className="px-6 py-4 font-medium">{row.nome}</td><td className="px-6 py-4"><span className={`text-xs px-2 py-1 rounded font-bold ${row.sfReason.includes('meta') ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>{row.sfReason}</span></td><td className="px-6 py-4 text-slate-500 text-xs font-mono">{row.ultimoBipRaw}</td><td className="px-6 py-4 text-slate-500 text-xs font-mono">{row.targetSaidaRaw}</td><td className="px-6 py-4 text-slate-500 text-xs font-mono">{row.clockOutRaw}</td></tr>))}</tbody>
                        </table>
                    </div>
                )}
                {setupViewMode === 'leaders' && (
                    <div className="bg-white rounded-b-xl shadow-sm border border-t-0 border-slate-200 overflow-hidden w-full">
                        <div className="p-4 bg-purple-50 text-purple-800 text-sm border-b border-purple-100 flex justify-between">
                            <span className="font-bold flex items-center gap-2"><Users size={16}/> Análise de Setup por Líder</span>
                            <span className="text-xs font-normal">Ordenado por Pessoas Ofensoras</span>
                        </div>
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-100 text-slate-600">
                                <tr>
                                    <th className="px-6 py-3">Team Leader</th>
                                    <th className="px-6 py-3 text-center">Total Pessoas</th>
                                    <th className="px-6 py-3 text-center bg-purple-50 text-purple-900">Pessoas Ofensoras</th>
                                    <th className="px-6 py-3 text-center">Total Falhas</th>
                                    <th className="px-6 py-3 text-center bg-slate-200 text-slate-700">Média 1º Bip</th>
                                    <th className="px-6 py-3 text-center bg-slate-200 text-slate-700">Média Desvio Saída</th>
                                    <th className="px-6 py-3 text-center">% Impacto</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {setupResults.leaders.map((l, i) => (
                                    <tr key={i} className="hover:bg-slate-50">
                                        <td className="px-6 py-4 font-medium text-slate-800">{l.name}</td>
                                        <td className="px-6 py-4 text-center text-slate-500">{l.totalPeople}</td>
                                        <td className="px-6 py-4 text-center font-bold text-purple-700 bg-purple-50/50">{l.uniqueOffenders}</td>
                                        <td className="px-6 py-4 text-center font-bold text-slate-600">{l.totalImpact}</td>
                                        <td className="px-6 py-4 text-center font-mono text-slate-600 bg-slate-50">{secondsToTime(l.avgFirstBip || 0)}</td>
                                        <td className="px-6 py-4 text-center font-mono text-slate-600 bg-slate-50">{secondsToTime(l.avgExitDiff || 0)}</td>
                                        <td className="px-6 py-4 text-center font-bold text-slate-700">{(l.offensePercentage || 0).toFixed(1)}%</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        )}

        {/* --- LUNCH (INTERVALO) DASHBOARD (NOVO) --- */}
        {fileData && appMode === 'lunch' && lunchResults && (
            <div className="space-y-6 w-full">
                {/* Control Header */}
                <div className="flex justify-between items-center bg-white p-4 rounded-lg border border-slate-200 shadow-sm w-full">
                    <div className="flex items-center gap-2"><span className="font-bold text-slate-700">Arquivo:</span><span className="text-slate-500 text-sm">{fileName}</span></div>
                    <button onClick={softReset} className="text-red-500 hover:text-red-700 text-sm font-medium">Trocar Arquivo</button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-slate-200 bg-white rounded-t-xl px-2 w-full">
                    <button onClick={() => setLunchViewMode('catraca')} className={`px-6 py-4 font-bold text-sm border-b-2 flex items-center gap-2 transition-colors ${lunchViewMode === 'catraca' ? 'border-red-500 text-red-600 bg-red-50' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                        <Clock size={18}/> Excesso Catraca <span className="bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full text-xs ml-2">{applyFilters(lunchResults.catraca).length}</span>
                    </button>
                    <button onClick={() => setLunchViewMode('retorno')} className={`px-6 py-4 font-bold text-sm border-b-2 flex items-center gap-2 transition-colors ${lunchViewMode === 'retorno' ? 'border-blue-500 text-blue-600 bg-blue-50' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                        <Timer size={18}/> Atraso Retorno <span className="bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full text-xs ml-2">{applyFilters(lunchResults.retorno).length}</span>
                    </button>
                    <button onClick={() => setLunchViewMode('total')} className={`px-6 py-4 font-bold text-sm border-b-2 flex items-center gap-2 transition-colors ${lunchViewMode === 'total' ? 'border-yellow-500 text-yellow-600 bg-yellow-50' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                        <TrendingUp size={18}/> Tempo Total {'>'} 1h10 <span className="bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full text-xs ml-2">{applyFilters(lunchResults.totalInterval).length}</span>
                    </button>
                    <button onClick={() => setLunchViewMode('leaders')} className={`px-6 py-4 font-bold text-sm border-b-2 flex items-center gap-2 transition-colors ${lunchViewMode === 'leaders' ? 'border-orange-500 text-orange-600 bg-orange-50' : 'border-transparent text-slate-500 hover:text-slate-700'}`}><BarChart size={18}/> Visão de Líderes</button>
                </div>

                {/* View: Catraca */}
                {lunchViewMode === 'catraca' && (
                    <div className="bg-white rounded-b-xl shadow-sm border border-t-0 border-slate-200 overflow-hidden w-full">
                        <div className="p-4 bg-red-50 text-red-800 text-sm border-b border-red-100 flex items-center gap-2">
                            <AlertTriangle size={16}/> Colaboradores com <strong>Tempo de Catraca {'>'} 01:00:30</strong>
                        </div>
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-100 text-slate-600">
                                <tr>
                                    <th className="px-6 py-3 font-semibold">Colaborador</th>
                                    <th className="px-6 py-3 font-semibold">Leader</th>
                                    <th className="px-6 py-3 font-semibold">Saída Catraca</th>
                                    <th className="px-6 py-3 font-semibold">Retorno Catraca</th>
                                    <th className="px-6 py-3 font-semibold text-right">Tempo Total</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {applyFilters(lunchResults.catraca).map((row, i) => (
                                    <tr key={i} className="hover:bg-slate-50">
                                        <td className="px-6 py-4 font-medium text-slate-800">{row.nome}</td>
                                        <td className="px-6 py-4 text-slate-500">{row.teamLeader}</td>
                                        <td className="px-6 py-4 text-slate-500 font-mono text-xs">{row.saidaCatraca}</td>
                                        <td className="px-6 py-4 text-slate-500 font-mono text-xs">{row.retornoCatraca}</td>
                                        <td className="px-6 py-4 text-right font-bold text-red-600 font-mono">{row.tempoCatracaRaw}</td>
                                    </tr>
                                ))}
                                {applyFilters(lunchResults.catraca).length === 0 && <tr><td colSpan={5} className="p-8 text-center text-slate-500">Nenhum ofensor de Catraca encontrado!</td></tr>}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* View: Retorno */}
                {lunchViewMode === 'retorno' && (
                    <div className="bg-white rounded-b-xl shadow-sm border border-t-0 border-slate-200 overflow-hidden w-full">
                        <div className="p-4 bg-blue-50 text-blue-800 text-sm border-b border-blue-100 flex items-center gap-2">
                            <AlertTriangle size={16}/> Atraso entre <strong>Catraca e Operação (BIP) {'>'} 10:00</strong>
                        </div>
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-100 text-slate-600">
                                <tr>
                                    <th className="px-6 py-3 font-semibold">Colaborador</th>
                                    <th className="px-6 py-3 font-semibold">Leader</th>
                                    <th className="px-6 py-3 font-semibold">Retorno Catraca</th>
                                    <th className="px-6 py-3 font-semibold">Retorno BIP</th>
                                    <th className="px-6 py-3 font-semibold text-right">Diferença (Atraso)</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {applyFilters(lunchResults.retorno).map((row, i) => (
                                    <tr key={i} className="hover:bg-slate-50">
                                        <td className="px-6 py-4 font-medium text-slate-800">{row.nome}</td>
                                        <td className="px-6 py-4 text-slate-500">{row.teamLeader}</td>
                                        <td className="px-6 py-4 text-slate-500 font-mono text-xs">{row.retornoCatraca}</td>
                                        <td className="px-6 py-4 text-slate-500 font-mono text-xs">{row.retornoBip}</td>
                                        <td className="px-6 py-4 text-right font-bold text-orange-600 font-mono">{row.diffRetornoFormatted}</td>
                                    </tr>
                                ))}
                                {applyFilters(lunchResults.retorno).length === 0 && <tr><td colSpan={5} className="p-8 text-center text-slate-500">Nenhum atraso de retorno encontrado!</td></tr>}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* View: Total Interval (Nova) */}
                {lunchViewMode === 'total' && (
                    <div className="bg-white rounded-b-xl shadow-sm border border-t-0 border-slate-200 overflow-hidden w-full">
                        <div className="p-4 bg-yellow-50 text-yellow-800 text-sm border-b border-yellow-100 flex items-center gap-2">
                            <AlertTriangle size={16}/> Tempo Total (Catraca + Retorno) <strong>{'>'} 01:10:00</strong>
                        </div>
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-100 text-slate-600">
                                <tr>
                                    <th className="px-6 py-3 font-semibold">Colaborador</th>
                                    <th className="px-6 py-3 font-semibold">Leader</th>
                                    <th className="px-6 py-3 font-semibold">Tempo Catraca</th>
                                    <th className="px-6 py-3 font-semibold">Tempo Retorno</th>
                                    <th className="px-6 py-3 font-semibold text-right">Soma Total</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {applyFilters(lunchResults.totalInterval).map((row, i) => (
                                    <tr key={i} className="hover:bg-slate-50">
                                        <td className="px-6 py-4 font-medium text-slate-800">{row.nome}</td>
                                        <td className="px-6 py-4 text-slate-500">{row.teamLeader}</td>
                                        <td className="px-6 py-4 text-slate-500 font-mono text-xs">{row.tempoCatracaRaw}</td>
                                        <td className="px-6 py-4 text-slate-500 font-mono text-xs">{row.diffRetornoFormatted}</td>
                                        <td className="px-6 py-4 text-right font-bold text-yellow-600 font-mono">{row.totalIntervalFormatted}</td>
                                    </tr>
                                ))}
                                {applyFilters(lunchResults.totalInterval).length === 0 && <tr><td colSpan={5} className="p-8 text-center text-slate-500">Nenhum excesso de tempo total encontrado!</td></tr>}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* View: Leaders */}
                {lunchViewMode === 'leaders' && (
                    <div className="bg-white rounded-b-xl shadow-sm border border-t-0 border-slate-200 overflow-hidden w-full">
                        <div className="p-4 bg-orange-50 text-orange-800 text-sm border-b border-orange-100 flex justify-between">
                            <span className="font-bold flex items-center gap-2"><Users size={16}/> Análise de Intervalo por Líder</span>
                            <span className="text-xs font-normal">Ordenado por Pessoas Ofensoras</span>
                        </div>
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-100 text-slate-600">
                                <tr>
                                    <th className="px-6 py-3">Team Leader</th>
                                    <th className="px-6 py-3 text-center">Total Pessoas</th>
                                    <th className="px-6 py-3 text-center bg-orange-100 text-orange-900">Pessoas Ofensoras</th>
                                    <th className="px-6 py-3 text-center">Total Falhas</th>
                                    <th className="px-6 py-3 text-center bg-slate-200 text-slate-700">Média Catraca</th>
                                    <th className="px-6 py-3 text-center bg-slate-200 text-slate-700">Média Retorno</th>
                                    <th className="px-6 py-3 text-center">% Impacto</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {lunchResults.leaders.map((l, i) => (
                                    <tr key={i} className="hover:bg-slate-50">
                                        <td className="px-6 py-4 font-medium text-slate-800">{l.name}</td>
                                        <td className="px-6 py-4 text-center text-slate-500">{l.totalPeople}</td>
                                        <td className="px-6 py-4 text-center font-bold text-orange-700 bg-orange-50/50">{l.uniqueOffenders}</td>
                                        <td className="px-6 py-4 text-center font-bold text-slate-600">{l.totalImpact}</td>
                                        <td className="px-6 py-4 text-center font-mono text-slate-600 bg-slate-50">{secondsToTime(l.avgCatraca || 0)}</td>
                                        <td className="px-6 py-4 text-center font-mono text-slate-600 bg-slate-50">{secondsToTime(l.avgRetorno || 0)}</td>
                                        <td className="px-6 py-4 text-center font-bold text-slate-700">{(l.offensePercentage || 0).toFixed(1)}%</td>
                                    </tr>
                                ))}
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
