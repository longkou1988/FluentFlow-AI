import React from 'react';
import { EnglishLevel } from '../types';
import { BookOpen, Briefcase, MessageCircle, Zap } from 'lucide-react';

interface LevelSelectionProps {
  onSelect: (level: EnglishLevel) => void;
}

const LevelSelection: React.FC<LevelSelectionProps> = ({ onSelect }) => {
  const levels = [
    {
      id: EnglishLevel.BEGINNER,
      title: 'Beginner',
      description: 'Slow pace, simple vocabulary, basic grammar corrections.',
      icon: <BookOpen className="w-6 h-6 text-green-400" />,
      color: 'hover:border-green-500/50 hover:bg-green-500/10'
    },
    {
      id: EnglishLevel.INTERMEDIATE,
      title: 'Intermediate',
      description: 'Natural pace, wider topics, focus on fluency and idioms.',
      icon: <MessageCircle className="w-6 h-6 text-blue-400" />,
      color: 'hover:border-blue-500/50 hover:bg-blue-500/10'
    },
    {
      id: EnglishLevel.ADVANCED,
      title: 'Advanced',
      description: 'Fast pace, complex discussions, nuanced feedback.',
      icon: <Zap className="w-6 h-6 text-purple-400" />,
      color: 'hover:border-purple-500/50 hover:bg-purple-500/10'
    },
    {
      id: EnglishLevel.BUSINESS,
      title: 'Business',
      description: 'Professional context, formal tone, negotiation & presentation skills.',
      icon: <Briefcase className="w-6 h-6 text-amber-400" />,
      color: 'hover:border-amber-500/50 hover:bg-amber-500/10'
    }
  ];

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 max-w-4xl mx-auto">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-cyan-400 mb-4">
          FluentFlow AI
        </h1>
        <p className="text-slate-400 text-lg max-w-lg mx-auto">
          Choose your proficiency level to start a real-time video conversation with your AI tutor.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
        {levels.map((level) => (
          <button
            key={level.id}
            onClick={() => onSelect(level.id)}
            className={`flex items-start p-6 rounded-2xl border border-slate-700 bg-slate-800/50 transition-all duration-300 text-left group ${level.color}`}
          >
            <div className="p-3 rounded-xl bg-slate-900 border border-slate-700 mr-4 group-hover:scale-110 transition-transform">
              {level.icon}
            </div>
            <div>
              <h3 className="text-xl font-semibold text-slate-100 mb-2">{level.title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed">{level.description}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default LevelSelection;