'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useMemo } from 'react';
import { Activity, Clock, ShieldAlert, UserPlus, FileText, Download, Filter, Search, CheckCircle2, AlertTriangle, RefreshCw, MoreVertical, X, ShieldBan, Key, Eye } from 'lucide-react';
import Link from 'next/link';

interface LogEvent {
  id: number;
  type: string;
  message: string;
  time: string;
  ip: string;
  status: 'critical' | 'warning' | 'success' | 'info';
  resolved?: boolean;
}

const INITIAL_LOGS: LogEvent[] = [
  { id: 1, type: 'security', message: 'Failed login attempt for admin@sthara.com', time: '2 mins ago', ip: '192.168.1.105', status: 'critical' },
  { id: 2, type: 'auth', message: 'Teacher 1 (DPS101) logged in successfully', time: '15 mins ago', ip: '10.0.0.45', status: 'info' },
  { id: 3, type: 'content', message: 'New video uploaded: "Algebra Basics"', time: '1 hour ago', ip: '10.0.0.45', status: 'success' },
  { id: 4, type: 'system', message: 'Nightly backup completed successfully', time: '5 hours ago', ip: 'localhost', status: 'success' },
  { id: 5, type: 'auth', message: 'Student 12 (DPS101) changed password', time: '1 day ago', ip: '172.16.0.22', status: 'info' },
  { id: 6, type: 'security', message: 'Multiple failed logins detected (IP: 45.33.22.1)', time: '1 day ago', ip: '45.33.22.1', status: 'warning' },
  { id: 7, type: 'content', message: 'Video deleted: "Old Physics Lab"', time: '2 days ago', ip: '10.0.0.45', status: 'info' },
  { id: 8, type: 'system', message: 'API Rate limit approaching threshold', time: '2 days ago', ip: 'system', status: 'warning' },
];

export default function SystemLogs() {
  const { profile, loading } = useAuth();
  const router = useRouter();
  
  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [logs, setLogs] = useState<LogEvent[]>(INITIAL_LOGS);
  
  const [selectedLog, setSelectedLog] = useState<LogEvent | null>(null);

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'superadmin')) {
      router.push('/login');
    }
  }, [profile, loading, router]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
    }, 800);
  };

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const matchesFilter = filter === 'all' || log.type === filter;
      const matchesSearch = log.message.toLowerCase().includes(searchQuery.toLowerCase()) || log.ip.includes(searchQuery);
      return matchesFilter && matchesSearch;
    });
  }, [logs, filter, searchQuery]);

  const handleExportCSV = () => {
    if (filteredLogs.length === 0) return;
    const headers = ['ID', 'Type', 'Status', 'Message', 'IP Address', 'Time'];
    const csvRows = [
      headers.join(','), 
      ...filteredLogs.map(log => 
        [log.id, log.type, log.status, `"${log.message.replace(/"/g, '""')}"`, log.ip, log.time].join(',')
      )
    ];
    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `system_logs_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleAction = (actionType: string) => {
    if (!selectedLog) return;
    
    // In a real app, this would make an API call to the backend
    setLogs(prev => prev.map(l => 
      l.id === selectedLog.id ? { ...l, resolved: true, status: 'info' } : l
    ));
    
    setSelectedLog(null);
  };

  const stats = useMemo(() => {
    return {
      total: logs.length,
      securityAlerts: logs.filter(l => l.type === 'security' && !l.resolved).length,
      authEvents: logs.filter(l => l.type === 'auth').length,
      uptime: '99.9%'
    };
  }, [logs]);

  const getLogIcon = (type: string, status: string) => {
    if (status === 'critical') return <ShieldAlert className="w-5 h-5 text-rose-600" />;
    if (status === 'warning') return <AlertTriangle className="w-5 h-5 text-amber-500" />;
    if (status === 'success') return <CheckCircle2 className="w-5 h-5 text-emerald-500" />;
    if (type === 'auth') return <UserPlus className="w-5 h-5 text-blue-500" />;
    if (type === 'content') return <FileText className="w-5 h-5 text-indigo-500" />;
    return <Activity className="w-5 h-5 text-purple-500" />;
  };

  const getLogBg = (status: string, type: string) => {
    if (status === 'critical') return 'bg-rose-100 border-rose-200';
    if (status === 'warning') return 'bg-amber-100 border-amber-200';
    if (status === 'success') return 'bg-emerald-100 border-emerald-200';
    if (type === 'auth') return 'bg-blue-100 border-blue-200';
    if (type === 'content') return 'bg-indigo-100 border-indigo-200';
    return 'bg-purple-100 border-purple-200';
  };

  if (loading || !profile) return (
    <div className="min-h-screen flex items-center justify-center">
      <RefreshCw className="w-10 h-10 animate-spin text-indigo-600" />
    </div>
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-7xl">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-[#002147]">System Logs</h1>
          <p className="text-gray-500 mt-1 font-medium">Real-time platform activity, audits, and security alerts.</p>
        </div>
        <div className="flex space-x-3">
          <button 
            onClick={handleRefresh}
            className="px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-600 font-bold shadow-sm hover:bg-gray-50 hover:text-[#002147] transition-all flex items-center space-x-2"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-indigo-600' : ''}`} />
            <span>Refresh</span>
          </button>
          <button 
            onClick={handleExportCSV}
            className="px-4 py-2.5 bg-gradient-to-r from-[#002147] to-indigo-900 text-white rounded-xl font-bold shadow-md hover:shadow-lg transition-all flex items-center space-x-2"
          >
            <Download className="w-4 h-4" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-gray-200/60 shadow-sm flex items-center space-x-4">
          <div className="p-3 bg-indigo-50 rounded-2xl">
            <Activity className="w-6 h-6 text-indigo-600" />
          </div>
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Total Events</p>
            <p className="text-2xl font-black text-[#002147]">{stats.total}</p>
          </div>
        </div>
        <div className="bg-white p-5 rounded-3xl border border-gray-200/60 shadow-sm flex items-center space-x-4">
          <div className="p-3 bg-rose-50 rounded-2xl">
            <ShieldAlert className="w-6 h-6 text-rose-600" />
          </div>
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Active Alerts</p>
            <p className="text-2xl font-black text-rose-600">{stats.securityAlerts}</p>
          </div>
        </div>
        <div className="bg-white p-5 rounded-3xl border border-gray-200/60 shadow-sm flex items-center space-x-4">
          <div className="p-3 bg-blue-50 rounded-2xl">
            <UserPlus className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Auth Events</p>
            <p className="text-2xl font-black text-[#002147]">{stats.authEvents}</p>
          </div>
        </div>
        <div className="bg-white p-5 rounded-3xl border border-gray-200/60 shadow-sm flex items-center space-x-4">
          <div className="p-3 bg-emerald-50 rounded-2xl">
            <CheckCircle2 className="w-6 h-6 text-emerald-600" />
          </div>
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">System Uptime</p>
            <p className="text-2xl font-black text-[#002147]">{stats.uptime}</p>
          </div>
        </div>
      </div>

      {/* Main Logs Panel */}
      <div className="bg-white rounded-3xl shadow-sm border border-gray-200/60 overflow-hidden">
        
        {/* Controls Toolbar */}
        <div className="p-5 border-b border-gray-100 bg-gray-50 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center space-x-2 overflow-x-auto w-full md:w-auto pb-2 md:pb-0 hide-scrollbar">
            <Filter className="w-4 h-4 text-gray-400 mr-2 shrink-0" />
            {['all', 'security', 'auth', 'content', 'system'].map(f => (
              <button 
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-1.5 rounded-full text-xs font-bold capitalize whitespace-nowrap transition-all ${filter === f ? 'bg-[#002147] text-white shadow-md' : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-100'}`}
              >
                {f}
              </button>
            ))}
          </div>
          
          <div className="relative w-full md:w-72 shrink-0">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
            <input 
              type="text" 
              placeholder="Search logs or IP..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-gray-200 rounded-xl pl-9 pr-4 py-2 text-sm text-[#002147] font-medium outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm"
            />
          </div>
        </div>
        
        {/* Logs List */}
        <div className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
          {filteredLogs.length === 0 ? (
            <div className="p-12 text-center text-gray-400 font-medium">
              No logs found matching your criteria.
            </div>
          ) : (
            filteredLogs.map((log) => {
              return (
                <div key={log.id} className={`p-5 transition-colors flex flex-col sm:flex-row sm:items-center justify-between group gap-4 ${log.resolved ? 'bg-gray-50/50 opacity-70' : 'hover:bg-indigo-50/30'}`}>
                  <div className="flex items-start space-x-4">
                    <div className={`p-2.5 rounded-xl border ${getLogBg(log.status, log.type)} shrink-0`}>
                      {getLogIcon(log.type, log.status)}
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <p className={`font-bold ${log.status === 'critical' && !log.resolved ? 'text-rose-700' : 'text-[#002147]'}`}>
                          {log.message}
                        </p>
                        {log.resolved && (
                          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[10px] font-bold uppercase tracking-wider">
                            Resolved
                          </span>
                        )}
                      </div>
                      <div className="flex items-center space-x-3 mt-1.5">
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px] font-bold uppercase tracking-wider">
                          {log.type}
                        </span>
                        <span className="text-xs font-mono text-gray-400 bg-gray-50 px-1.5 rounded border border-gray-100">
                          IP: {log.ip}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-4 sm:self-start shrink-0 ml-14 sm:ml-0">
                    <div className="flex items-center space-x-2 text-gray-400 text-xs font-bold bg-white px-3 py-1.5 rounded-lg border border-gray-100 shadow-sm">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{log.time}</span>
                    </div>
                    
                    <button 
                      onClick={() => setSelectedLog(log)}
                      className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                        log.status === 'critical' || log.status === 'warning' 
                          ? 'bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-600 hover:text-white hover:shadow-md' 
                          : 'bg-white text-[#002147] border-gray-200 hover:bg-indigo-50 hover:border-indigo-200'
                      }`}
                    >
                      {log.status === 'critical' || log.status === 'warning' ? 'Take Action' : 'View Details'}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
        
        {/* Footer */}
        <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-between items-center text-xs font-bold text-gray-400">
          <span>Showing {filteredLogs.length} events</span>
          <span>End of log trace</span>
        </div>
      </div>

      {/* Action Modal */}
      {selectedLog && (
        <div className="fixed inset-0 bg-[#001229]/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-300">
            <div className={`p-6 border-b flex justify-between items-center ${
              selectedLog.status === 'critical' ? 'bg-rose-50 border-rose-100' :
              selectedLog.status === 'warning' ? 'bg-amber-50 border-amber-100' :
              'bg-[#f8fafc] border-gray-100'
            }`}>
              <div className="flex items-center space-x-3">
                <div className={`p-2 rounded-xl ${getLogBg(selectedLog.status, selectedLog.type)}`}>
                  {getLogIcon(selectedLog.type, selectedLog.status)}
                </div>
                <div>
                  <h3 className="text-lg font-black text-[#002147]">Event Details</h3>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mt-0.5">{selectedLog.type} Event</p>
                </div>
              </div>
              <button onClick={() => setSelectedLog(null)} className="p-2 text-gray-400 hover:text-gray-700 bg-white/50 rounded-xl transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                <p className="text-[#002147] font-medium text-lg leading-snug">{selectedLog.message}</p>
                <div className="mt-4 grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Time</p>
                    <p className="text-sm font-medium text-[#002147]">{selectedLog.time}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">IP Address</p>
                    <p className="text-sm font-mono text-[#002147]">{selectedLog.ip}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-bold text-[#002147] uppercase tracking-wider mb-2">Available Actions</p>
                
                {(selectedLog.status === 'critical' || selectedLog.status === 'warning') && (
                  <>
                    <button 
                      onClick={() => handleAction('block')}
                      className="w-full flex items-center justify-between p-4 bg-white border border-rose-200 rounded-2xl hover:bg-rose-50 hover:shadow-md transition-all group"
                    >
                      <div className="flex items-center space-x-3 text-rose-700">
                        <ShieldBan className="w-5 h-5 group-hover:scale-110 transition-transform" />
                        <span className="font-bold">Block IP Address</span>
                      </div>
                      <span className="text-xs font-bold text-rose-500">Immediate</span>
                    </button>
                    
                    <button 
                      onClick={() => handleAction('reset')}
                      className="w-full flex items-center justify-between p-4 bg-white border border-amber-200 rounded-2xl hover:bg-amber-50 hover:shadow-md transition-all group"
                    >
                      <div className="flex items-center space-x-3 text-amber-700">
                        <Key className="w-5 h-5 group-hover:scale-110 transition-transform" />
                        <span className="font-bold">Force Password Reset</span>
                      </div>
                      <span className="text-xs font-bold text-amber-500">Requires Relogin</span>
                    </button>
                  </>
                )}

                <button 
                  onClick={() => handleAction('acknowledge')}
                  className="w-full flex items-center justify-between p-4 bg-white border border-gray-200 rounded-2xl hover:bg-indigo-50 hover:border-indigo-200 hover:shadow-md transition-all group"
                >
                  <div className="flex items-center space-x-3 text-[#002147]">
                    <CheckCircle2 className="w-5 h-5 group-hover:scale-110 transition-transform" />
                    <span className="font-bold">Acknowledge & Mark Resolved</span>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
