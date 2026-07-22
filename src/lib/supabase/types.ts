// Supabase Database Types
// Auto-generated shape matching our SQL schema in supabase_schema.sql

export interface School {
  id: string;
  name: string;
  institution_type: string;
  trial_expires_at: string | null;
  settings: Record<string, any>;
  created_at: string;
}

export interface User {
  id: string;
  school_id: string | null;
  name: string | null;
  email: string | null;
  role: 'student' | 'teacher' | 'admin' | 'superadmin' | 'parent';
  student_class: string | null;
  branch: string | null;
  year: string | null;
  semester: string | null;
  custom_student_id: string | null;
  teacher_class: string | null;
  teacher_subject: string | null;
  assignments: any[];
  teaching_subjects: any[];
  historical_weaknesses: string[];
  metadata: Record<string, any>;
  created_at: string;
}

export interface Assignment {
  id: string;
  school_id: string;
  teacher_id: string | null;
  title: string;
  type: 'homework' | 'quiz' | 'task';
  subject: string | null;
  class: string | null;
  description: string | null;
  instructions: string | null;
  due_date: string | null;
  questions: any[];
  tasks: any[];
  units: string[];
  question_paper_url: string | null;
  assigned_student_ids: string[];
  total_marks: number | null;
  status: string;
  created_at: string;
}

export interface Submission {
  id: string;
  assignment_id: string;
  student_id: string;
  school_id: string;
  score: number | null;
  max_score: number | null;
  grade: string | null;
  final_grade: string | null;
  ai_graded: boolean;
  ai_result: any | null;
  teacher_approved: boolean | null;
  image_urls: string[];
  submission_text: string | null;
  answers: any | null;
  type: string | null;
  submitted_at: string;
}

export interface Syllabus {
  id: string;
  school_id: string;
  teacher_id: string | null;
  subject: string | null;
  class: string | null;
  topic: string | null;
  month: string | null;
  status: string;
  created_at: string;
}

export interface StudentChat {
  id: string;
  student_id: string;
  role: 'user' | 'model';
  content: string;
  created_at: string;
}

export interface StudentMemory {
  student_id: string;
  memory: Record<string, any>;
  updated_at: string;
}

export interface WellnessLog {
  id: string;
  student_id: string;
  school_id: string;
  mood: string | null;
  energy: number | null;
  note: string | null;
  created_at: string;
}

export interface Situation {
  id: string;
  school_id: string;
  teacher_id: string | null;
  type: string | null;
  message: string | null;
  student_name: string | null;
  student_id: string | null;
  acknowledged: boolean;
  metadata: Record<string, any>;
  created_at: string;
}

export interface Notification {
  id: string;
  school_id: string;
  student_id: string | null;
  title: string | null;
  body: string | null;
  read: boolean;
  created_at: string;
}

export interface Material {
  id: string;
  school_id: string;
  teacher_id: string | null;
  title: string | null;
  content: any | null;
  subject: string | null;
  class: string | null;
  created_at: string;
}

export interface Class {
  id: string;
  school_id: string;
  name: string | null;
  metadata: Record<string, any>;
  created_at: string;
}

// Database shape for Supabase client typing
export interface Database {
  public: {
    Tables: {
      schools:       { Row: School;       Insert: Partial<School>;       Update: Partial<School> };
      users:         { Row: User;         Insert: Partial<User>;         Update: Partial<User> };
      assignments:   { Row: Assignment;   Insert: Partial<Assignment>;   Update: Partial<Assignment> };
      submissions:   { Row: Submission;   Insert: Partial<Submission>;   Update: Partial<Submission> };
      syllabus:      { Row: Syllabus;     Insert: Partial<Syllabus>;     Update: Partial<Syllabus> };
      student_chats: { Row: StudentChat;  Insert: Partial<StudentChat>;  Update: Partial<StudentChat> };
      student_memory:{ Row: StudentMemory;Insert: Partial<StudentMemory>;Update: Partial<StudentMemory> };
      wellness_logs: { Row: WellnessLog;  Insert: Partial<WellnessLog>;  Update: Partial<WellnessLog> };
      situations:    { Row: Situation;    Insert: Partial<Situation>;    Update: Partial<Situation> };
      notifications: { Row: Notification; Insert: Partial<Notification>; Update: Partial<Notification> };
      materials:     { Row: Material;     Insert: Partial<Material>;     Update: Partial<Material> };
      classes:       { Row: Class;        Insert: Partial<Class>;        Update: Partial<Class> };
    };
  };
}
