'use client';

import { useState, useEffect } from 'react';
import { X, ChevronRight, PlayCircle, Loader2, ArrowLeft, BookOpen, Trophy } from 'lucide-react';
import { db } from '@/lib/firebase/config';
import { doc, getDoc, setDoc } from 'firebase/firestore';

interface Video {
  id: string;
  title: string;
  duration: string;
}

interface Chapter {
  id: string;
  name: string;
  score: number;
  videos: Video[];
}

interface Subject {
  id: string;
  name: string;
  score: number;
  chapters: Chapter[];
}

interface MasteryData {
  subjects: Subject[];
}

// Generate some state-of-the-art fallback data in case the DB is empty
const defaultMasteryData: MasteryData = {
  subjects: [
    {
      id: 'math', name: 'Mathematics', score: 84,
      chapters: [
        { id: 'm_c1', name: 'Quadratic Equations', score: 92, videos: [
          { id: 'm_c1_v1', title: 'Understanding the Quadratic Formula', duration: '12 min' },
          { id: 'm_c1_v2', title: 'Solving by Factoring', duration: '8 min' },
          { id: 'm_c1_v3', title: 'Completing the Square', duration: '15 min' },
          { id: 'm_c1_v4', title: 'Nature of Roots', duration: '10 min' },
          { id: 'm_c1_v5', title: 'Word Problems on Quadratic Eq', duration: '20 min' }
        ]},
        { id: 'm_c2', name: 'Polynomials', score: 65, videos: [
          { id: 'm_c2_v1', title: 'Polynomial Division Basics', duration: '10 min' },
          { id: 'm_c2_v2', title: 'Remainder Theorem Explained', duration: '15 min' },
          { id: 'm_c2_v3', title: 'Factor Theorem', duration: '12 min' },
          { id: 'm_c2_v4', title: 'Algebraic Identities', duration: '18 min' },
          { id: 'm_c2_v5', title: 'Zeroes of a Polynomial', duration: '9 min' }
        ]},
        { id: 'm_c3', name: 'Coordinate Geometry', score: 88, videos: [
          { id: 'm_c3_v1', title: 'Distance Formula', duration: '7 min' },
          { id: 'm_c3_v2', title: 'Section Formula', duration: '11 min' },
          { id: 'm_c3_v3', title: 'Midpoint Formula', duration: '5 min' },
          { id: 'm_c3_v4', title: 'Area of a Triangle', duration: '14 min' },
          { id: 'm_c3_v5', title: 'Collinear Points', duration: '8 min' }
        ]},
        { id: 'm_c4', name: 'Linear Equations', score: 78, videos: [
          { id: 'm_c4_v1', title: 'Graphical Method of Solution', duration: '12 min' },
          { id: 'm_c4_v2', title: 'Substitution Method', duration: '10 min' },
          { id: 'm_c4_v3', title: 'Elimination Method', duration: '11 min' },
          { id: 'm_c4_v4', title: 'Cross-Multiplication Method', duration: '14 min' },
          { id: 'm_c4_v5', title: 'Equations Reducible to Linear Form', duration: '16 min' }
        ]},
        { id: 'm_c5', name: 'Arithmetic Progressions', score: 90, videos: [
          { id: 'm_c5_v1', title: 'Introduction to AP', duration: '8 min' },
          { id: 'm_c5_v2', title: 'nth Term of an AP', duration: '12 min' },
          { id: 'm_c5_v3', title: 'Sum of First n Terms', duration: '15 min' },
          { id: 'm_c5_v4', title: 'Word Problems on AP', duration: '18 min' },
          { id: 'm_c5_v5', title: 'Properties of AP', duration: '10 min' }
        ]},
        { id: 'm_c6', name: 'Triangles', score: 55, videos: [
          { id: 'm_c6_v1', title: 'Similar Figures', duration: '10 min' },
          { id: 'm_c6_v2', title: 'Similarity of Triangles', duration: '14 min' },
          { id: 'm_c6_v3', title: 'Criteria for Similarity', duration: '16 min' },
          { id: 'm_c6_v4', title: 'Areas of Similar Triangles', duration: '12 min' },
          { id: 'm_c6_v5', title: 'Pythagoras Theorem', duration: '15 min' }
        ]},
        { id: 'm_c7', name: 'Circles', score: 82, videos: [
          { id: 'm_c7_v1', title: 'Tangent to a Circle', duration: '9 min' },
          { id: 'm_c7_v2', title: 'Number of Tangents from a Point', duration: '12 min' },
          { id: 'm_c7_v3', title: 'Theorems on Tangents', duration: '15 min' },
          { id: 'm_c7_v4', title: 'Cyclic Quadrilaterals', duration: '14 min' },
          { id: 'm_c7_v5', title: 'Properties of Chords', duration: '11 min' }
        ]},
        { id: 'm_c8', name: 'Trigonometry', score: 68, videos: [
          { id: 'm_c8_v1', title: 'Trigonometric Ratios', duration: '14 min' },
          { id: 'm_c8_v2', title: 'Trigonometric Ratios of Specific Angles', duration: '12 min' },
          { id: 'm_c8_v3', title: 'Trigonometric Identities', duration: '18 min' },
          { id: 'm_c8_v4', title: 'Heights and Distances', duration: '20 min' },
          { id: 'm_c8_v5', title: 'Complementary Angles', duration: '10 min' }
        ]},
        { id: 'm_c9', name: 'Surface Areas and Volumes', score: 74, videos: [
          { id: 'm_c9_v1', title: 'Surface Area of a Combination of Solids', duration: '15 min' },
          { id: 'm_c9_v2', title: 'Volume of a Combination of Solids', duration: '16 min' },
          { id: 'm_c9_v3', title: 'Conversion of Solid from One Shape to Another', duration: '14 min' },
          { id: 'm_c9_v4', title: 'Frustum of a Cone', duration: '18 min' },
          { id: 'm_c9_v5', title: 'Complex Word Problems', duration: '22 min' }
        ]},
        { id: 'm_c10', name: 'Statistics and Probability', score: 95, videos: [
          { id: 'm_c10_v1', title: 'Mean of Grouped Data', duration: '12 min' },
          { id: 'm_c10_v2', title: 'Mode of Grouped Data', duration: '10 min' },
          { id: 'm_c10_v3', title: 'Median of Grouped Data', duration: '14 min' },
          { id: 'm_c10_v4', title: 'Graphical Representation of Cumulative Frequency', duration: '16 min' },
          { id: 'm_c10_v5', title: 'Theoretical Approach to Probability', duration: '15 min' }
        ]}
      ]
    },
    {
      id: 'sci', name: 'Science', score: 76,
      chapters: [
        { id: 's_c1', name: 'Chemical Reactions', score: 80, videos: [
          { id: 's_c1_v1', title: 'Chemical Equations', duration: '10 min' },
          { id: 's_c1_v2', title: 'Balancing Equations', duration: '15 min' },
          { id: 's_c1_v3', title: 'Types of Chemical Reactions', duration: '18 min' },
          { id: 's_c1_v4', title: 'Oxidation and Reduction', duration: '12 min' },
          { id: 's_c1_v5', title: 'Effects of Oxidation in Everyday Life', duration: '8 min' }
        ]},
        { id: 's_c2', name: 'Acids, Bases and Salts', score: 60, videos: [
          { id: 's_c2_v1', title: 'Chemical Properties of Acids and Bases', duration: '14 min' },
          { id: 's_c2_v2', title: 'What do all Acids and Bases have in common?', duration: '11 min' },
          { id: 's_c2_v3', title: 'How Strong are Acid or Base Solutions?', duration: '12 min' },
          { id: 's_c2_v4', title: 'Importance of pH in Everyday Life', duration: '9 min' },
          { id: 's_c2_v5', title: 'More about Salts', duration: '15 min' }
        ]},
        { id: 's_c3', name: 'Metals and Non-metals', score: 88, videos: [
          { id: 's_c3_v1', title: 'Physical Properties', duration: '8 min' },
          { id: 's_c3_v2', title: 'Chemical Properties of Metals', duration: '16 min' },
          { id: 's_c3_v3', title: 'How do Metals and Non-metals React?', duration: '14 min' },
          { id: 's_c3_v4', title: 'Occurrence of Metals', duration: '12 min' },
          { id: 's_c3_v5', title: 'Corrosion', duration: '9 min' }
        ]},
        { id: 's_c4', name: 'Carbon and its Compounds', score: 50, videos: [
          { id: 's_c4_v1', title: 'Bonding in Carbon', duration: '11 min' },
          { id: 's_c4_v2', title: 'Versatile Nature of Carbon', duration: '15 min' },
          { id: 's_c4_v3', title: 'Chemical Properties of Carbon Compounds', duration: '18 min' },
          { id: 's_c4_v4', title: 'Some Important Carbon Compounds', duration: '14 min' },
          { id: 's_c4_v5', title: 'Soaps and Detergents', duration: '10 min' }
        ]},
        { id: 's_c5', name: 'Periodic Classification', score: 72, videos: [
          { id: 's_c5_v1', title: 'Early Attempts at Classification', duration: '12 min' },
          { id: 's_c5_v2', title: 'Mendeleev\'s Periodic Table', duration: '14 min' },
          { id: 's_c5_v3', title: 'Modern Periodic Table', duration: '16 min' },
          { id: 's_c5_v4', title: 'Position of Elements', duration: '10 min' },
          { id: 's_c5_v5', title: 'Trends in the Modern Periodic Table', duration: '12 min' }
        ]},
        { id: 's_c6', name: 'Life Processes', score: 85, videos: [
          { id: 's_c6_v1', title: 'What are Life Processes?', duration: '6 min' },
          { id: 's_c6_v2', title: 'Nutrition', duration: '15 min' },
          { id: 's_c6_v3', title: 'Respiration', duration: '18 min' },
          { id: 's_c6_v4', title: 'Transportation', duration: '16 min' },
          { id: 's_c6_v5', title: 'Excretion', duration: '12 min' }
        ]},
        { id: 's_c7', name: 'Control and Coordination', score: 68, videos: [
          { id: 's_c7_v1', title: 'Animals – Nervous System', duration: '14 min' },
          { id: 's_c7_v2', title: 'Coordination in Plants', duration: '16 min' },
          { id: 's_c7_v3', title: 'Hormones in Animals', duration: '15 min' },
          { id: 's_c7_v4', title: 'Reflex Action', duration: '10 min' },
          { id: 's_c7_v5', title: 'Human Brain Structure', duration: '12 min' }
        ]},
        { id: 's_c8', name: 'How do Organisms Reproduce?', score: 92, videos: [
          { id: 's_c8_v1', title: 'Do Organisms Create Exact Copies?', duration: '10 min' },
          { id: 's_c8_v2', title: 'Modes of Reproduction used by Single Organisms', duration: '14 min' },
          { id: 's_c8_v3', title: 'Sexual Reproduction', duration: '16 min' },
          { id: 's_c8_v4', title: 'Reproduction in Human Beings', duration: '18 min' },
          { id: 's_c8_v5', title: 'Reproductive Health', duration: '12 min' }
        ]},
        { id: 's_c9', name: 'Heredity and Evolution', score: 79, videos: [
          { id: 's_c9_v1', title: 'Accumulation of Variation', duration: '10 min' },
          { id: 's_c9_v2', title: 'Heredity', duration: '15 min' },
          { id: 's_c9_v3', title: 'Evolution', duration: '16 min' },
          { id: 's_c9_v4', title: 'Speciation', duration: '12 min' },
          { id: 's_c9_v5', title: 'Evolution and Classification', duration: '14 min' }
        ]},
        { id: 's_c10', name: 'Light Reflection and Refraction', score: 81, videos: [
          { id: 's_c10_v1', title: 'Reflection of Light', duration: '12 min' },
          { id: 's_c10_v2', title: 'Spherical Mirrors', duration: '16 min' },
          { id: 's_c10_v3', title: 'Refraction of Light', duration: '14 min' },
          { id: 's_c10_v4', title: 'Lenses', duration: '15 min' },
          { id: 's_c10_v5', title: 'Power of a Lens', duration: '8 min' }
        ]}
      ]
    },
    {
      id: 'eng', name: 'English', score: 92,
      chapters: [
        { id: 'e_c1', name: 'Grammar Fundamentals', score: 95, videos: [
          { id: 'e_c1_v1', title: 'Parts of Speech Overview', duration: '10 min' },
          { id: 'e_c1_v2', title: 'Nouns and Pronouns', duration: '12 min' },
          { id: 'e_c1_v3', title: 'Verbs and Adverbs', duration: '14 min' },
          { id: 'e_c1_v4', title: 'Adjectives and Prepositions', duration: '11 min' },
          { id: 'e_c1_v5', title: 'Conjunctions and Interjections', duration: '9 min' }
        ]},
        { id: 'e_c2', name: 'Subject-Verb Agreement', score: 88, videos: [
          { id: 'e_c2_v1', title: 'Basic Rules of Agreement', duration: '12 min' },
          { id: 'e_c2_v2', title: 'Compound Subjects', duration: '10 min' },
          { id: 'e_c2_v3', title: 'Indefinite Pronouns', duration: '14 min' },
          { id: 'e_c2_v4', title: 'Collective Nouns', duration: '9 min' },
          { id: 'e_c2_v5', title: 'Exceptions and Tricky Cases', duration: '15 min' }
        ]},
        { id: 'e_c3', name: 'Tenses and their Usage', score: 85, videos: [
          { id: 'e_c3_v1', title: 'Present Tense', duration: '15 min' },
          { id: 'e_c3_v2', title: 'Past Tense', duration: '16 min' },
          { id: 'e_c3_v3', title: 'Future Tense', duration: '14 min' },
          { id: 'e_c3_v4', title: 'Perfect Tenses', duration: '18 min' },
          { id: 'e_c3_v5', title: 'Continuous and Perfect Continuous Tenses', duration: '20 min' }
        ]},
        { id: 'e_c4', name: 'Active and Passive Voice', score: 90, videos: [
          { id: 'e_c4_v1', title: 'Introduction to Voices', duration: '10 min' },
          { id: 'e_c4_v2', title: 'Rules for Conversion', duration: '15 min' },
          { id: 'e_c4_v3', title: 'Voice Change in Assertive Sentences', duration: '12 min' },
          { id: 'e_c4_v4', title: 'Voice Change in Interrogative Sentences', duration: '14 min' },
          { id: 'e_c4_v5', title: 'Voice Change in Imperative Sentences', duration: '11 min' }
        ]},
        { id: 'e_c5', name: 'Direct and Indirect Speech', score: 82, videos: [
          { id: 'e_c5_v1', title: 'Concept of Narration', duration: '10 min' },
          { id: 'e_c5_v2', title: 'Rules for Changing Tenses', duration: '16 min' },
          { id: 'e_c5_v3', title: 'Rules for Changing Pronouns', duration: '12 min' },
          { id: 'e_c5_v4', title: 'Interrogative Sentences', duration: '14 min' },
          { id: 'e_c5_v5', title: 'Exclamatory and Optative Sentences', duration: '15 min' }
        ]},
        { id: 'e_c6', name: 'Reading Comprehension', score: 94, videos: [
          { id: 'e_c6_v1', title: 'Skimming and Scanning Techniques', duration: '12 min' },
          { id: 'e_c6_v2', title: 'Identifying Main Ideas', duration: '10 min' },
          { id: 'e_c6_v3', title: 'Understanding Tone and Purpose', duration: '14 min' },
          { id: 'e_c6_v4', title: 'Inferring Meaning from Context', duration: '16 min' },
          { id: 'e_c6_v5', title: 'Tackling Complex Passages', duration: '15 min' }
        ]},
        { id: 'e_c7', name: 'Essay Writing Techniques', score: 89, videos: [
          { id: 'e_c7_v1', title: 'Structuring an Essay', duration: '14 min' },
          { id: 'e_c7_v2', title: 'Writing a Strong Introduction', duration: '12 min' },
          { id: 'e_c7_v3', title: 'Developing Body Paragraphs', duration: '16 min' },
          { id: 'e_c7_v4', title: 'Crafting a Conclusion', duration: '10 min' },
          { id: 'e_c7_v5', title: 'Types of Essays', duration: '15 min' }
        ]},
        { id: 'e_c8', name: 'Literature: Poetry Analysis', score: 96, videos: [
          { id: 'e_c8_v1', title: 'Understanding Poetic Devices', duration: '15 min' },
          { id: 'e_c8_v2', title: 'Analyzing Rhyme and Meter', duration: '12 min' },
          { id: 'e_c8_v3', title: 'Interpreting Imagery and Metaphor', duration: '16 min' },
          { id: 'e_c8_v4', title: 'Theme and Tone in Poetry', duration: '14 min' },
          { id: 'e_c8_v5', title: 'Writing a Poetry Analysis Essay', duration: '18 min' }
        ]},
        { id: 'e_c9', name: 'Literature: Prose Interpretation', score: 91, videos: [
          { id: 'e_c9_v1', title: 'Elements of Fiction', duration: '12 min' },
          { id: 'e_c9_v2', title: 'Character Analysis', duration: '14 min' },
          { id: 'e_c9_v3', title: 'Plot Structure', duration: '10 min' },
          { id: 'e_c9_v4', title: 'Setting and Atmosphere', duration: '15 min' },
          { id: 'e_c9_v5', title: 'Identifying Themes', duration: '16 min' }
        ]},
        { id: 'e_c10', name: 'Vocabulary Building', score: 98, videos: [
          { id: 'e_c10_v1', title: 'Root Words and Affixes', duration: '14 min' },
          { id: 'e_c10_v2', title: 'Synonyms and Antonyms', duration: '12 min' },
          { id: 'e_c10_v3', title: 'Idioms and Phrases', duration: '15 min' },
          { id: 'e_c10_v4', title: 'Context Clues', duration: '10 min' },
          { id: 'e_c10_v5', title: 'Commonly Confused Words', duration: '16 min' }
        ]}
      ]
    }
  ]
};

export default function MasteryModal({ profile, onClose }: { profile: any, onClose: () => void }) {
  const [data, setData] = useState<MasteryData | null>(null);
  const [loading, setLoading] = useState(true);

  // View state: 'subjects' | 'chapters' | 'videos'
  const [view, setView] = useState<'subjects' | 'chapters' | 'videos'>('subjects');
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null);

  useEffect(() => {
    const fetchOrSeedData = async () => {
      if (!profile?.schoolId || !profile?.uid) return;
      setLoading(true);
      try {
        const docRef = doc(db, 'schools', profile.schoolId, 'users', profile.uid, 'mastery_data', 'overall');
        // Always overwrite during this development phase so you see the new 10-chapter data
        await setDoc(docRef, defaultMasteryData);
        setData(defaultMasteryData);
      } catch (err) {
        console.error('Error fetching mastery data:', err);
        setData(defaultMasteryData); // Fallback
      } finally {
        setLoading(false);
      }
    };
    fetchOrSeedData();
  }, [profile]);

  const handleSubjectClick = (subject: Subject) => {
    setSelectedSubject(subject);
    setView('chapters');
  };

  const handleChapterClick = (chapter: Chapter) => {
    setSelectedChapter(chapter);
    setView('videos');
  };

  const handleBack = () => {
    if (view === 'videos') {
      setView('chapters');
      setSelectedChapter(null);
    } else if (view === 'chapters') {
      setView('subjects');
      setSelectedSubject(null);
    }
  };

  // Helper for progress bar color
  const getScoreColor = (score: number) => {
    if (score >= 85) return 'bg-emerald-500';
    if (score >= 70) return 'bg-blue-500';
    if (score >= 50) return 'bg-orange-500';
    return 'bg-red-500';
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#002147]/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-300 border border-white/20">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-[#002147] to-[#003366] p-6 text-white flex justify-between items-center shrink-0">
          <div className="flex items-center space-x-4">
            {view !== 'subjects' && (
              <button onClick={handleBack} className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors">
                <ArrowLeft className="w-5 h-5 text-white" />
              </button>
            )}
            <div>
              <h2 className="text-2xl font-bold flex items-center space-x-2">
                <Trophy className="w-6 h-6 text-orange-400" />
                <span>
                  {view === 'subjects' ? 'Overall Mastery' : 
                   view === 'chapters' ? `${selectedSubject?.name} Mastery` : 
                   `${selectedChapter?.name} Resources`}
                </span>
              </h2>
              <p className="text-blue-200 text-sm mt-1">
                {view === 'subjects' ? 'Track your proficiency across all subjects.' : 
                 view === 'chapters' ? 'Drill down into specific chapters and topics.' : 
                 'Review suggested videos to improve your understanding.'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 bg-white/10 rounded-full hover:bg-red-500 hover:text-white transition-all text-white/70">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Area */}
        <div className="p-8 overflow-y-auto flex-1 bg-gray-50/50 relative min-h-[400px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full">
              <Loader2 className="w-12 h-12 animate-spin text-blue-500 mb-4" />
              <p className="text-[#002147]/60 font-medium">Analyzing learning patterns...</p>
            </div>
          ) : !data ? (
            <div className="text-center text-red-500 p-10 h-full flex items-center justify-center">Failed to load mastery data.</div>
          ) : (
            <div className="space-y-6">
              
              {/* SUBJECTS VIEW */}
              {view === 'subjects' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {data.subjects.map(subject => (
                    <div 
                      key={subject.id} 
                      onClick={() => handleSubjectClick(subject)}
                      className="bg-white rounded-2xl p-6 shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-gray-100 hover:shadow-xl hover:-translate-y-1 transition-all cursor-pointer group"
                    >
                      <div className="flex justify-between items-end mb-4">
                        <div className="flex items-center space-x-3">
                          <div className="bg-blue-50 p-3 rounded-xl">
                            <BookOpen className="w-6 h-6 text-blue-600" />
                          </div>
                          <h3 className="text-xl font-bold text-[#002147]">{subject.name}</h3>
                        </div>
                        <span className="text-2xl font-black text-[#002147]">{subject.score}%</span>
                      </div>
                      
                      <div className="w-full bg-gray-100 rounded-full h-3 mb-2 overflow-hidden">
                        <div 
                          className={`h-3 rounded-full ${getScoreColor(subject.score)} transition-all duration-1000 ease-out`}
                          style={{ width: `${subject.score}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-xs font-bold text-gray-400 mt-2">
                        <span>Beginner</span>
                        <span className="text-blue-500">Proficient</span>
                        <span>Master</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* CHAPTERS VIEW */}
              {view === 'chapters' && selectedSubject && (
                <div className="space-y-4 animate-in slide-in-from-right-8 duration-300">
                  {selectedSubject.chapters.map(chapter => (
                    <div 
                      key={chapter.id}
                      onClick={() => handleChapterClick(chapter)}
                      className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex items-center justify-between hover:border-blue-200 hover:shadow-md transition-all cursor-pointer group"
                    >
                      <div className="flex-1 pr-6">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-bold text-lg text-[#002147] group-hover:text-blue-600 transition-colors">{chapter.name}</h4>
                          <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                            chapter.score >= 85 ? 'bg-emerald-100 text-emerald-700' :
                            chapter.score >= 70 ? 'bg-blue-100 text-blue-700' :
                            'bg-orange-100 text-orange-700'
                          }`}>
                            {chapter.score}% Mastery
                          </span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                          <div 
                            className={`h-2 rounded-full ${getScoreColor(chapter.score)} transition-all duration-1000 ease-out`}
                            style={{ width: `${chapter.score}%` }}
                          />
                        </div>
                        {chapter.score < 70 && (
                          <p className="text-xs text-orange-500 font-medium mt-2 flex items-center">
                            <span className="w-2 h-2 rounded-full bg-orange-500 mr-2 inline-block animate-pulse"></span>
                            Needs improvement. Click to view suggested resources.
                          </p>
                        )}
                      </div>
                      <div className="bg-gray-50 p-3 rounded-full group-hover:bg-blue-50 transition-colors">
                        <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-blue-500" />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* VIDEOS VIEW */}
              {view === 'videos' && selectedChapter && (
                <div className="space-y-4 animate-in slide-in-from-right-8 duration-300">
                  {selectedChapter.videos.length === 0 ? (
                    <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-gray-200">
                      <PlayCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                      <p className="text-gray-500 font-medium">No recommended videos for this chapter right now.</p>
                    </div>
                  ) : (
                    selectedChapter.videos.map(video => (
                      <div 
                        key={video.id}
                        className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between hover:shadow-md transition-all group"
                      >
                        <div className="flex items-center space-x-4 mb-4 sm:mb-0">
                          <div className="w-32 h-20 bg-gray-900 rounded-xl relative overflow-hidden flex-shrink-0 group-hover:scale-105 transition-transform shadow-inner cursor-pointer">
                            <div className="absolute inset-0 flex items-center justify-center">
                              <PlayCircle className="w-8 h-8 text-white/80 group-hover:text-white group-hover:scale-110 transition-all" />
                            </div>
                            <div className="absolute bottom-1 right-1 bg-black/70 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                              {video.duration}
                            </div>
                          </div>
                          <div>
                            <h4 className="font-bold text-[#002147] group-hover:text-blue-600 transition-colors line-clamp-2">{video.title}</h4>
                            <p className="text-xs text-gray-500 font-medium mt-1">Sthara Diagnostic Engine Recommendation</p>
                          </div>
                        </div>
                        <button className="w-full sm:w-auto bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white px-5 py-2.5 rounded-xl font-bold transition-colors">
                          Watch Now
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
