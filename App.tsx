import React, { useState } from 'react';
import LevelSelection from './components/LevelSelection';
import ActiveCall from './components/ActiveCall';
import { EnglishLevel } from './types';

const App: React.FC = () => {
  const [currentLevel, setCurrentLevel] = useState<EnglishLevel | null>(null);

  const handleLevelSelect = (level: EnglishLevel) => {
    setCurrentLevel(level);
  };

  const handleEndCall = () => {
    setCurrentLevel(null);
  };

  return (
    <div className="antialiased font-sans">
      {!currentLevel ? (
        <LevelSelection onSelect={handleLevelSelect} />
      ) : (
        <ActiveCall level={currentLevel} onEndCall={handleEndCall} />
      )}
    </div>
  );
};

export default App;