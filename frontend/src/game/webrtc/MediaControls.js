const MEDIA_CONSTRAINTS = { video: true, audio: true };

export class MediaControls {
  constructor() {
    this.stream = null;
    this.muted = false;
    this.videoOn = true;
    this.available = false;
  }

  async init() {
    const previousPermissionGranted = await this.checkPreviousPermission();

    if (this.stream) {
      return true;
    }

    if (previousPermissionGranted) {
      return this.available;
    }

    return await this.getUserMedia(true);
  }

  async checkPreviousPermission() {
    try {
      if (!navigator.permissions?.query) {
        return false;
      }

      const result = await navigator.permissions.query({ name: 'microphone' });
      if (result?.state === 'granted') {
        return await this.getUserMedia(false);
      }
    } catch {
      // Permissions API is not universally available.
    }

    return false;
  }

  async getUserMedia(showPrompt = true) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(MEDIA_CONSTRAINTS);
      this.attachStream(stream);
      return true;
    } catch (error) {
      this.available = false;
      this.stream = null;
      this.muted = true;
      this.videoOn = false;

      if (showPrompt) {
        console.warn('Media permissions denied or unavailable', error);
      } else {
        console.warn('Media stream unavailable without prompting');
      }

      return false;
    }
  }

  attachStream(stream) {
    this.stream = stream;
    this.available = true;
    this.muted = this.getAudioTracks().every((track) => track.enabled === false);
    this.videoOn = this.getVideoTracks().every((track) => track.enabled !== false);
  }

  getAudioTracks() {
    return this.stream?.getAudioTracks?.() || [];
  }

  getVideoTracks() {
    return this.stream?.getVideoTracks?.() || [];
  }

  getStream() {
    return this.stream;
  }

  toggleMute() {
    const nextMuted = !this.isMuted();
    this.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });
    this.muted = nextMuted;
    return this.muted;
  }

  toggleVideo() {
    const nextVideoOn = !this.isVideoOn();
    this.getVideoTracks().forEach((track) => {
      track.enabled = nextVideoOn;
    });
    this.videoOn = nextVideoOn;
    return this.videoOn;
  }

  isMuted() {
    if (!this.stream) {
      return true;
    }

    const tracks = this.getAudioTracks();
    if (tracks.length === 0) {
      return true;
    }

    return tracks.every((track) => track.enabled === false);
  }

  isVideoOn() {
    if (!this.stream) {
      return false;
    }

    const tracks = this.getVideoTracks();
    if (tracks.length === 0) {
      return false;
    }

    return tracks.every((track) => track.enabled !== false);
  }

  destroy() {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
    }

    this.stream = null;
    this.available = false;
    this.muted = true;
    this.videoOn = false;
  }
}

export default MediaControls;