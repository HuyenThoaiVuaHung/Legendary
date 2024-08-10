export interface VcnvData {
    questions: VcnvQuestion[];
    playerAnswers: PlayerAnswer[];
    showResults: boolean;
    disabledPlayers: number[];
    noOfOpenRows: number;
    CNVPlayers: any[];
  }
  
  export interface PlayerAnswer {
    answer: string;
    correct: boolean;
  }
  
  export interface VcnvQuestion {
    id: number;
    type: "HN" | "HN_S" | "CNV";
    value: number;
    ifOpen: boolean;
    ifShown: boolean;
    question: string;
    answer: string;
    audioFilePath?: string;
    picFileName?: string;
  }
  
  export interface KdData {
    questions: KdQuestions;
    gamemode: "S" | "M";
    currentSingleplayerPlayer: number;
  }
  
  export interface KdQuestions {
    singleplayer: Array<KdQuestion[]>;
    multiplayer: KdQuestion[];
  }
  
  export interface KdQuestion {
    question: string;
    answer: string;
    type: KdType;
    audioFilePath?: string;
  }
  
  export enum KdType {
    N = "N",
    P = "P",
    A = "A",
  }
  
  export interface TtData {
    questions: TtQuestion[];
    playerAnswers: PlayerAnswerTt[];
    showResults: boolean;
    currentQuestion: number;
    showAnswer: boolean;
    timerStartTimestamp: number;
  }
  
  export interface PlayerAnswerTt {
    id: number;
    answer: string;
    timestamp: number;
    readableTime: string;
    correct: boolean;
  }
  
  export interface TtQuestion {
    id: number;
    question: string;
    answer: string;
    type: "TT_IMG" | "TT_VD";
    question_image?: string;
    answer_image?: string;
    video_name?: string;
  }
  
  export interface VdData {
    questionPools: Array<VdQuestion[]>;
    currentPlayerId: number;
    ifQuestionPickerShowing: boolean;
    questionPickerArray: boolean[];
    ifNSHV: boolean;
    NSHV: boolean;
    questions: any[];
  }
  
  export interface VdQuestion {
    value: number;
    type: VdType;
    question: string;
    answer: string;
    file_name?: string;
  }
  
  export enum VdType {
    A = "A",
    I = "I",
    N = "N",
    V = "V",
  }
  export enum Type {
    AUDIO = "A",
    IMAGE = "I",
    NORMAL = "N",
    VIDEO = "V",
  }
  export interface ChpData {
    questions: ChpQuestion[];
    playerIDs: boolean[];
  }
  
  export interface ChpQuestion {
    question: string;
    answer: string;
  }
  
  export interface Question {
    question: string;
    answer: string;
    type: Type;
    image_name?: string;
    secondary_image_name?: string;
    audio_name?: string;
    video_name?: string;
  }
  