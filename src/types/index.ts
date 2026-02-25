export interface Chapter {
  id: string;
  title: string;
  startTime: number; // seconds
  endTime?: number;  // seconds
}

export interface BookMetadata {
  title: string;
  artist?: string;
  album?: string;
  year?: string;
  duration?: number;
  coverUrl?: string;
  chapters: Chapter[];
  fileUrl: string;
  fileId?: string; // assigned by server after upload
}
