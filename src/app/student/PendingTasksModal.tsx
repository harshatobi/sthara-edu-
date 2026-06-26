'use client';

import { useState } from 'react';
import { X, CheckCircle2, Clock, PlayCircle, BookOpen, ChevronRight, FileText, Calendar, BrainCircuit } from 'lucide-react';

interface Assignment {
  id: string;
  title: string;
  type: string;
  dueDate: string;
  description: string;
  subject: string;
  teacherName: string;
}

interface PendingTasksModalProps {
  assignments: Assignment[];
  onClose: () => void;
}

// Mock Data for "Topics to Learn" & "General"
const topicsToLearn = [
  { id: 't1', title: 'Polynomial Division Basics', subject: 'Mathematics', duration: '10 min', type: 'video' },
  { id: 't2', title: 'Chemical Equations', subject: 'Science', duration: '15 min', type: 'video' },
  { id: 't3', title: 'Subject-Verb Agreement Rules', subject: 'English', duration: '12 min', type: 'reading' }
];

const generalTasks = [
  { id: 'g1', title: 'Review upcoming Term 1 Syllabus', priority: 'High', type: 'alert' },
  { id: 'g2', title: 'Complete your weekly Wellness Check-in', priority: 'Medium', type: 'survey' }
];

export default function PendingTasksModal({ assignments, onClose }: PendingTasksModalProps) {
  const [activeTab, setActiveTab] = useState<'assignments' | 'topics' | 'general'>('assignments');

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#002147]/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-300 border border-white/20">
        
        {/* Header */}
        <div className="bg-gradient-to-br from-orange-400 via-orange-500 to-red-500 p-8 text-white relative shrink-0 overflow-hidden">
          <div className="absolute top-0 right-0 p-12 opacity-10 pointer-events-none">
            <Calendar className="w-48 h-48" />
          </div>
          <div className="relative z-10 flex justify-between items-start">
            <div>
              <div className="inline-flex items-center space-x-2 bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-sm font-bold mb-4">
                <Clock className="w-4 h-4" />
                <span>Today's Plan</span>
              </div>
              <h2 className="text-4xl font-extrabold tracking-tight mb-2">Pending Tasks</h2>
              <p className="text-orange-50 font-medium text-lg max-w-xl">
                Stay on top of your learning. Here is everything you need to accomplish today.
              </p>
            </div>
            <button onClick={onClose} className="p-2 bg-white/20 rounded-full hover:bg-black/20 transition-all text-white backdrop-blur-md">
              <X className="w-6 h-6" />
            </button>
          </div>
          
          {/* Tabs */}
          <div className="flex space-x-2 mt-8 relative z-10">
            <button 
              onClick={() => setActiveTab('assignments')}
              className={`px-5 py-2.5 rounded-xl font-bold transition-all flex items-center space-x-2 ${activeTab === 'assignments' ? 'bg-white text-orange-600 shadow-md' : 'bg-white/10 hover:bg-white/20 text-white'}`}
            >
              <FileText className="w-4 h-4" />
              <span>Assignments ({assignments.length})</span>
            </button>
            <button 
              onClick={() => setActiveTab('topics')}
              className={`px-5 py-2.5 rounded-xl font-bold transition-all flex items-center space-x-2 ${activeTab === 'topics' ? 'bg-white text-orange-600 shadow-md' : 'bg-white/10 hover:bg-white/20 text-white'}`}
            >
              <BrainCircuit className="w-4 h-4" />
              <span>Topics to Learn ({topicsToLearn.length})</span>
            </button>
            <button 
              onClick={() => setActiveTab('general')}
              className={`px-5 py-2.5 rounded-xl font-bold transition-all flex items-center space-x-2 ${activeTab === 'general' ? 'bg-white text-orange-600 shadow-md' : 'bg-white/10 hover:bg-white/20 text-white'}`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>General ({generalTasks.length})</span>
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="p-6 md:p-8 overflow-y-auto flex-1 bg-[#f8fafc]">
          
          {/* ASSIGNMENTS */}
          {activeTab === 'assignments' && (
            <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-300">
              {assignments.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-3xl border border-dashed border-gray-200">
                  <CheckCircle2 className="w-16 h-16 text-emerald-400 mx-auto mb-4" />
                  <h3 className="text-xl font-bold text-[#002147] mb-2">All caught up!</h3>
                  <p className="text-gray-500 font-medium">You have no pending assignments right now.</p>
                </div>
              ) : (
                assignments.map(assignment => (
                  <div key={assignment.id} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between hover:shadow-md transition-all group">
                    <div className="flex items-start space-x-4 mb-4 sm:mb-0">
                      <div className="bg-orange-50 p-3 rounded-xl shrink-0">
                        <FileText className="w-6 h-6 text-orange-500" />
                      </div>
                      <div>
                        <h4 className="font-bold text-lg text-[#002147] group-hover:text-orange-500 transition-colors">{assignment.title}</h4>
                        <div className="flex flex-wrap items-center gap-3 mt-2 text-xs font-bold text-gray-500">
                          <span className="flex items-center space-x-1">
                            <BookOpen className="w-3.5 h-3.5" />
                            <span>{assignment.subject}</span>
                          </span>
                          <span className="w-1.5 h-1.5 rounded-full bg-gray-300"></span>
                          <span className="flex items-center space-x-1 text-red-500">
                            <Clock className="w-3.5 h-3.5" />
                            <span>Due: {assignment.dueDate || 'No Set Date'}</span>
                          </span>
                          <span className="w-1.5 h-1.5 rounded-full bg-gray-300"></span>
                          <span className="capitalize">{assignment.type}</span>
                        </div>
                      </div>
                    </div>
                    <button className="w-full sm:w-auto bg-orange-50 text-orange-600 hover:bg-orange-500 hover:text-white px-6 py-3 rounded-xl font-bold transition-colors flex items-center justify-center space-x-2 shrink-0">
                      <span>Start Task</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TOPICS TO LEARN */}
          {activeTab === 'topics' && (
            <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-300">
              {topicsToLearn.map(topic => (
                <div key={topic.id} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between hover:shadow-md transition-all group">
                  <div className="flex items-center space-x-4 mb-4 sm:mb-0">
                    <div className="w-24 h-16 bg-gray-900 rounded-xl relative overflow-hidden flex-shrink-0 group-hover:scale-105 transition-transform shadow-inner">
                      <div className="absolute inset-0 flex items-center justify-center">
                        {topic.type === 'video' ? (
                          <PlayCircle className="w-6 h-6 text-white/80 group-hover:text-white group-hover:scale-110 transition-all" />
                        ) : (
                          <BookOpen className="w-6 h-6 text-white/80 group-hover:text-white group-hover:scale-110 transition-all" />
                        )}
                      </div>
                    </div>
                    <div>
                      <h4 className="font-bold text-lg text-[#002147] group-hover:text-blue-600 transition-colors">{topic.title}</h4>
                      <div className="flex flex-wrap items-center gap-3 mt-2 text-xs font-bold text-gray-500">
                        <span className="flex items-center space-x-1">
                          <BookOpen className="w-3.5 h-3.5" />
                          <span>{topic.subject}</span>
                        </span>
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-300"></span>
                        <span className="flex items-center space-x-1">
                          <Clock className="w-3.5 h-3.5" />
                          <span>{topic.duration}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                  <button className="w-full sm:w-auto bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white px-6 py-3 rounded-xl font-bold transition-colors flex items-center justify-center space-x-2 shrink-0">
                    <span>{topic.type === 'video' ? 'Watch Now' : 'Read Now'}</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* GENERAL TASKS */}
          {activeTab === 'general' && (
            <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-300">
              {generalTasks.map(task => (
                <div key={task.id} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between hover:shadow-md transition-all group">
                  <div className="flex items-start space-x-4 mb-4 sm:mb-0">
                    <div className={`p-3 rounded-xl shrink-0 ${task.priority === 'High' ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-500'}`}>
                      <CheckCircle2 className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="font-bold text-lg text-[#002147] group-hover:text-[#002147]/70 transition-colors">{task.title}</h4>
                      <div className="flex flex-wrap items-center gap-3 mt-2 text-xs font-bold text-gray-500">
                        <span className={`px-2.5 py-0.5 rounded-full ${task.priority === 'High' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                          {task.priority} Priority
                        </span>
                        <span className="capitalize text-gray-400 border border-gray-200 px-2 py-0.5 rounded-full">{task.type}</span>
                      </div>
                    </div>
                  </div>
                  <button className="w-full sm:w-auto bg-gray-50 text-gray-600 hover:bg-gray-800 hover:text-white px-6 py-3 rounded-xl font-bold transition-colors flex items-center justify-center space-x-2 shrink-0">
                    <span>View Task</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
