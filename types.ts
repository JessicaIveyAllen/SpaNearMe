export enum CallState {
  IDLE = 'IDLE',
  CONNECTING = 'CONNECTING',
  ACTIVE = 'ACTIVE',
  ENDED = 'ENDED',
  ERROR = 'ERROR',
}

export interface TranscriptMessage {
  speaker: 'user' | 'bot';
  text: string;
  isFinal: boolean;
}

export interface CrmLead {
  fullName: string;
  phoneNumber: string;
  email: string;
  timestamp: string;
}