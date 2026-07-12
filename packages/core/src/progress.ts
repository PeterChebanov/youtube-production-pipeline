export interface ProgressEvent {
  stage: string;
  message: string;
  percent?: number;
}

let reporter: ((event: ProgressEvent) => void) | null = null;

export function setProgressReporter(fn: ((event: ProgressEvent) => void) | null): void {
  reporter = fn;
}

export function reportProgress(event: ProgressEvent): void {
  reporter?.(event);
}
