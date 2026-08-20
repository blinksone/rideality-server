import React, { useState } from 'react';
import { HelpCircle, Search, MessageSquare, CheckSquare, Send, User, BadgeAlert, Sparkles } from 'lucide-react';
import { SupportTicket, Message } from '../types';

interface SupportViewProps {
  tickets: SupportTicket[];
  setTickets: React.Dispatch<React.SetStateAction<SupportTicket[]>>;
  addDispatchLog: (type: 'pickup' | 'dropoff' | 'request' | 'cancel' | 'payment', message: string) => void;
  searchTerm: string;
}

export default function SupportView({ tickets, setTickets, addDispatchLog, searchTerm }: SupportViewProps) {
  const [activeTicketId, setActiveTicketId] = useState<string>(tickets[0]?.id || '');
  const [replyText, setReplyText] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Open' | 'Resolved'>('All');

  const activeTicket = tickets.find(t => t.id === activeTicketId);

  const filteredTickets = tickets.filter(t => {
    const matchesSearch = t.user.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          t.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          t.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'All' || t.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || !activeTicketId) return;

    const timestamp = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const newMessage: Message = {
      sender: 'Agent',
      text: replyText,
      time: timestamp
    };

    setTickets(prev => prev.map(t => {
      if (t.id === activeTicketId) {
        return {
          ...t,
          lastMessage: replyText,
          messages: [...t.messages, newMessage]
        };
      }
      return t;
    }));

    addDispatchLog('request', `Support ticket response dispatched to ${activeTicket?.user}: "${replyText.substring(0, 30)}..."`);
    setReplyText('');
  };

  const handleToggleResolve = (id: string, user: string, currentStatus: 'Open' | 'Resolved') => {
    const nextStatus = currentStatus === 'Open' ? 'Resolved' : 'Open';
    setTickets(prev => prev.map(t => t.id === id ? { ...t, status: nextStatus } : t));
    addDispatchLog('request', `Support ticket for ${user} set to ${nextStatus.toUpperCase()}`);
  };

  return (
    <div id="support-view-container" className="space-y-6">
      {/* View Header Info */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
        <div>
          <h2 className="text-base font-bold font-display text-slate-800">Operational Helpdesk Console</h2>
          <p className="text-xs text-slate-400">Resolve GPS synchronization errors, billing double charges, and corporate fleet dispatch queries</p>
        </div>

        {/* Status Filters */}
        <div className="flex rounded-xl border border-slate-100 overflow-hidden text-xs font-bold p-1 bg-slate-50 gap-1 self-start md:self-auto">
          {['All', 'Open', 'Resolved'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st as any)}
              className={`px-3 py-1.5 rounded-lg text-center transition-all cursor-pointer ${
                statusFilter === st
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {st} Tickets
            </button>
          ))}
        </div>
      </div>

      {/* Messaging split-pane */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[500px]">
        {/* Left: Tickets Index */}
        <div className="bg-white border border-slate-100 rounded-2xl lg:col-span-4 overflow-y-auto divide-y divide-slate-100 flex flex-col">
          <div className="p-3.5 bg-slate-50/50 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Roster ({filteredTickets.length})
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
            {filteredTickets.length > 0 ? (
              filteredTickets.map((tkt) => {
                const isActive = tkt.id === activeTicketId;
                return (
                  <button
                    key={tkt.id}
                    onClick={() => setActiveTicketId(tkt.id)}
                    className={`w-full p-4 text-left hover:bg-slate-50/40 transition-colors flex items-start gap-3 relative ${
                      isActive ? 'bg-blue-50/20' : ''
                    }`}
                  >
                    {isActive && <span className="absolute left-0 top-0 bottom-0 w-1 bg-blue-600 rounded-r-md"></span>}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-slate-800 text-xs truncate">{tkt.user}</span>
                        <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full border ${
                          tkt.status === 'Open' ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-slate-100 text-slate-400 border-slate-200'
                        }`}>
                          {tkt.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-semibold mt-0.5">
                        <span>{tkt.role}</span>
                        <span>•</span>
                        <span className="font-mono text-[9px]">{tkt.id.substring(4)}</span>
                      </div>
                      <p className="text-xs text-slate-700 font-medium truncate mt-1.5">{tkt.subject}</p>
                      <p className="text-[11px] text-slate-400 truncate mt-0.5 leading-snug">{tkt.lastMessage}</p>
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="p-8 text-center text-slate-400 text-xs">
                No tickets matches filters
              </div>
            )}
          </div>
        </div>

        {/* Right: Active Ticket Chat Console */}
        <div className="bg-white border border-slate-100 rounded-2xl lg:col-span-8 flex flex-col h-full overflow-hidden">
          {activeTicket ? (
            <>
              {/* Active Ticket Header */}
              <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-blue-600 text-white font-semibold flex items-center justify-center font-display text-sm">
                    {activeTicket.user[0]}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-slate-800 text-sm leading-none">{activeTicket.user}</h4>
                      <span className="text-[10px] font-mono text-slate-400">({activeTicket.role})</span>
                    </div>
                    <span className="text-xs text-slate-500 font-medium">{activeTicket.subject}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
                    activeTicket.status === 'Open' ? 'bg-amber-50 text-amber-600 border-amber-150' : 'bg-slate-100 text-slate-400 border-slate-200'
                  }`}>
                    {activeTicket.status} Status
                  </span>
                  <button
                    id="toggle-ticket-resolve"
                    onClick={() => handleToggleResolve(activeTicket.id, activeTicket.user, activeTicket.status)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border ${
                      activeTicket.status === 'Open'
                        ? 'bg-emerald-600 hover:bg-emerald-700 border-transparent text-white shadow-sm'
                        : 'text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {activeTicket.status === 'Open' ? 'Mark Resolved' : 'Reopen Ticket'}
                  </button>
                </div>
              </div>

              {/* Chat Thread */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/20 scrollbar-thin">
                <div className="text-center">
                  <span className="text-[9.5px] font-mono font-bold uppercase text-slate-400 bg-white border border-slate-150/50 px-2 py-0.5 rounded-full">
                    Ticket opened on {activeTicket.created}
                  </span>
                </div>

                {activeTicket.messages.map((msg, index) => {
                  const isAgent = msg.sender === 'Agent';
                  return (
                    <div
                      key={index}
                      className={`flex ${isAgent ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[70%] p-3 rounded-2xl space-y-1 ${
                          isAgent
                            ? 'bg-blue-600 text-white rounded-tr-none shadow-sm'
                            : 'bg-white border border-slate-100 text-slate-700 rounded-tl-none shadow-[0_2px_8px_rgba(0,0,0,0.01)]'
                        }`}
                      >
                        <p className="text-xs leading-relaxed font-normal whitespace-pre-wrap">{msg.text}</p>
                        <div className={`text-[9px] text-right font-medium ${isAgent ? 'text-blue-100' : 'text-slate-400'}`}>
                          {msg.time}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Chat Reply Form */}
              <form onSubmit={handleSendMessage} className="p-3 border-t border-slate-100 bg-white flex gap-2">
                <input
                  id="chat-reply-input"
                  type="text"
                  required
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder={`Reply to ${activeTicket.user}...`}
                  className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/15 focus:border-blue-500 font-medium"
                />
                <button
                  type="submit"
                  className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all flex items-center justify-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Send Response</span>
                </button>
              </form>
            </>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 text-center py-12">
              <MessageSquare className="w-12 h-12 mb-3 stroke-1 text-slate-300" />
              <p className="text-xs font-medium">Select a customer or driver support chat log from the left roster</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
