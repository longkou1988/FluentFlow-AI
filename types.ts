export enum EnglishLevel {
  BEGINNER = 'Beginner',
  INTERMEDIATE = 'Intermediate',
  ADVANCED = 'Advanced',
  BUSINESS = 'Business'
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  isPartial?: boolean;
}

export interface LiveConfig {
  level: EnglishLevel;
}
