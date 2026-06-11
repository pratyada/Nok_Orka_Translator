/**
 * Audio player for streaming PCM16 playback.
 * Buffers incoming chunks and plays them sequentially.
 */
export class AudioPlayer {
  private context: AudioContext;
  private queue: AudioBuffer[] = [];
  private isPlaying = false;
  private sampleRate: number;

  constructor(sampleRate = 24000) {
    this.context = new AudioContext({ sampleRate });
    this.sampleRate = sampleRate;
  }

  enqueue(pcm16Data: ArrayBuffer): void {
    const int16 = new Int16Array(pcm16Data);
    const float32 = new Float32Array(int16.length);

    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 0x8000;
    }

    const audioBuffer = this.context.createBuffer(
      1,
      float32.length,
      this.sampleRate,
    );
    audioBuffer.getChannelData(0).set(float32);
    this.queue.push(audioBuffer);

    if (!this.isPlaying) {
      this.playNext();
    }
  }

  private playNext(): void {
    const buffer = this.queue.shift();
    if (!buffer) {
      this.isPlaying = false;
      return;
    }

    this.isPlaying = true;
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.context.destination);
    source.onended = () => this.playNext();
    source.start();
  }

  stop(): void {
    this.queue = [];
    this.isPlaying = false;
  }

  async resume(): Promise<void> {
    if (this.context.state === "suspended") {
      await this.context.resume();
    }
  }
}
