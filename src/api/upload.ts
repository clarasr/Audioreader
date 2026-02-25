/**
 * Uploads an audio file to the server.
 * Uses XMLHttpRequest so we get upload progress events.
 * Returns the fileId assigned by the server.
 */
export function uploadAudioFile(
  file: File,
  onProgress: (percent: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append('file', file);

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const { fileId } = JSON.parse(xhr.responseText) as { fileId: string };
        resolve(fileId);
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Network error during upload')));
    xhr.addEventListener('abort', () => reject(new Error('Upload was cancelled')));

    xhr.open('POST', '/api/upload');
    xhr.send(formData);
  });
}
