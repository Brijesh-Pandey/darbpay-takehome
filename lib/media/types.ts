export interface MediaFile {
  bytes: Buffer;
  mimeType: string;
}

export interface MediaStore {
  get(mediaId: string): Promise<MediaFile>;
}

export class MediaNotFoundError extends Error {
  constructor(message = 'Unknown media id') {
    super(message);
    this.name = 'MediaNotFoundError';
  }
}

export class MediaMapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MediaMapError';
  }
}
