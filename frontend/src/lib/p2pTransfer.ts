'use client';

import { Socket } from 'socket.io-client';

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
  ],
};

const CHUNK_SIZE = 64 * 1024; // 64 KB per WebRTC message
const MAX_BUFFERED_AMOUNT = 512 * 1024; // Flow control threshold

export interface P2PFileMetadata {
  jobId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

/**
 * Customer Mobile -> Shop PC
 * Sends a file directly to the shopkeeper's browser via WebRTC DataChannel.
 * Returns true if direct P2P transfer succeeds, false if it times out/fails (prompting fallback).
 */
export async function sendP2PFile(
  socket: Socket,
  shopId: string,
  jobId: string,
  file: File,
  onProgress?: (percent: number) => void,
  timeoutMs: number = 4500
): Promise<boolean> {
  if (typeof window === 'undefined' || !window.RTCPeerConnection) {
    console.warn('[P2P] WebRTC not supported on this platform.');
    return false;
  }

  return new Promise<boolean>((resolve) => {
    let resolved = false;
    let pc: RTCPeerConnection | null = null;
    let dc: RTCDataChannel | null = null;
    let targetShopSocketId = '';

    const handleAnswer = async (data: { fromSocketId: string; jobId: string; answer: any }) => {
      if (data.jobId !== jobId || !pc) return;
      targetShopSocketId = data.fromSocketId;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
      } catch (e) {
        console.error('[P2P] Failed to set remote description:', e);
        finish(false);
      }
    };

    const handleIceCandidate = async (data: { fromSocketId: string; candidate: any; jobId: string }) => {
      if (data.jobId !== jobId || !pc) return;
      try {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      } catch (e) {
        console.warn('[P2P] Error adding ICE candidate:', e);
      }
    };

    const handleFileAck = (data: { jobId: string; success: boolean }) => {
      if (data.jobId === jobId && data.success) {
        console.log('[P2P] Received direct delivery confirmation from shop counter!');
        finish(true);
      }
    };

    const cleanup = () => {
      socket.off('p2p_answer_received', handleAnswer);
      socket.off('p2p_ice_candidate_received', handleIceCandidate);
      socket.off('p2p_file_ack_received', handleFileAck);
      if (dc) {
        dc.onclose = null;
        dc.onerror = null;
        dc.onmessage = null;
        try { dc.close(); } catch {}
      }
      if (pc) {
        pc.onicecandidate = null;
        pc.onconnectionstatechange = null;
        try { pc.close(); } catch {}
      }
    };

    const finish = (success: boolean) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      cleanup();
      resolve(success);
    };

    // Timeout fallback if shop PC doesn't answer or connection blocked
    const timer = setTimeout(() => {
      console.warn('[P2P] Transfer timed out or direct pipe blocked. Falling back.');
      finish(false);
    }, timeoutMs);

    try {
      pc = new RTCPeerConnection(ICE_SERVERS);

      // Create data channel
      dc = pc.createDataChannel('printspot_file_transfer', {
        ordered: true,
      });
      dc.binaryType = 'arraybuffer';

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('p2p_ice_candidate', {
            targetSocketId: targetShopSocketId,
            candidate: event.candidate,
            jobId,
          });
        }
      };

      socket.on('p2p_answer_received', handleAnswer);
      socket.on('p2p_ice_candidate_received', handleIceCandidate);
      socket.on('p2p_file_ack_received', handleFileAck);

      // When direct data pipe opens, stream file
      dc.onopen = async () => {
        console.log('[P2P] Direct DataChannel opened! Streaming file directly to shopkeeper PC...');
        if (!dc) return;

        // 1. Send Header
        const header = JSON.stringify({
          type: 'header',
          jobId,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type || 'application/octet-stream',
        });
        dc.send(header);

        // 2. Stream Binary Chunks
        let offset = 0;
        const totalSize = file.size;

        const sendNextChunk = () => {
          if (!dc || dc.readyState !== 'open') return;

          while (offset < totalSize) {
            if (dc.bufferedAmount > MAX_BUFFERED_AMOUNT) {
              // Throttle to prevent WebRTC buffer overflow
              setTimeout(sendNextChunk, 20);
              return;
            }

            const slice = file.slice(offset, offset + CHUNK_SIZE);
            const reader = new FileReader();

            reader.onload = () => {
              if (!dc || dc.readyState !== 'open') return;
              try {
                dc.send(reader.result as ArrayBuffer);
                offset += (reader.result as ArrayBuffer).byteLength;
                const percent = Math.min(100, Math.round((offset / totalSize) * 100));
                onProgress?.(percent);

                if (offset < totalSize) {
                  sendNextChunk();
                } else {
                  // 3. Send EOF
                  dc.send(JSON.stringify({ type: 'eof', jobId }));
                  console.log('[P2P] Finished streaming all bytes. Waiting for counter ack.');
                  // Give 2 seconds for ack, else resolve true
                  setTimeout(() => finish(true), 1500);
                }
              } catch (err) {
                console.error('[P2P] Send error:', err);
                finish(false);
              }
            };

            reader.readAsArrayBuffer(slice);
            return;
          }
        };

        sendNextChunk();
      };

      dc.onerror = (err) => {
        console.warn('[P2P] DataChannel error:', err);
        finish(false);
      };

      // Create & emit Offer
      pc.createOffer().then(async (offer) => {
        if (!pc) return;
        await pc.setLocalDescription(offer);
        socket.emit('p2p_offer', {
          shopId,
          jobId,
          offer,
          metadata: {
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type,
          },
        });
      }).catch((err) => {
        console.error('[P2P] Create offer error:', err);
        finish(false);
      });
    } catch (err) {
      console.error('[P2P] Setup error:', err);
      finish(false);
    }
  });
}

/**
 * Shop PC Receiver Listener
 * Listens on the shopkeeper's dashboard for incoming peer file transfers.
 * Creates local Blob object URLs in browser memory with zero cloud storage.
 */
export function initP2PReceiver(
  socket: Socket,
  onFileReceived: (jobId: string, blobUrl: string, metadata: P2PFileMetadata) => void,
  onProgress?: (jobId: string, percent: number) => void
): () => void {
  const activePeers = new Map<string, { pc: RTCPeerConnection; chunks: ArrayBuffer[]; meta: P2PFileMetadata | null; receivedBytes: number }>();

  const handleOffer = async (data: { fromSocketId: string; jobId: string; offer: any; metadata: any }) => {
    console.log(`[P2P Receiver] Incoming direct file connection for job ${data.jobId} from socket ${data.fromSocketId}`);

    try {
      const pc = new RTCPeerConnection(ICE_SERVERS);
      const state = {
        pc,
        chunks: [] as ArrayBuffer[],
        meta: data.metadata as P2PFileMetadata,
        receivedBytes: 0,
      };
      activePeers.set(data.jobId, state);

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('p2p_ice_candidate', {
            targetSocketId: data.fromSocketId,
            candidate: event.candidate,
            jobId: data.jobId,
          });
        }
      };

      pc.ondatachannel = (event) => {
        const dc = event.channel;
        dc.binaryType = 'arraybuffer';

        dc.onmessage = (msgEvent) => {
          if (typeof msgEvent.data === 'string') {
            try {
              const parsed = JSON.parse(msgEvent.data);
              if (parsed.type === 'header') {
                state.meta = parsed;
                state.chunks = [];
                state.receivedBytes = 0;
              } else if (parsed.type === 'eof') {
                // Assemble final Blob in browser memory!
                const blob = new Blob(state.chunks, { type: state.meta?.mimeType || 'application/pdf' });
                const blobUrl = URL.createObjectURL(blob);
                console.log(`[P2P Receiver] Assembled direct file ${state.meta?.fileName} (${blob.size} bytes). Local URL ready.`);

                onFileReceived(data.jobId, blobUrl, state.meta || {
                  jobId: data.jobId,
                  fileName: 'document.pdf',
                  fileSize: blob.size,
                  mimeType: blob.type,
                });

                // Acknowledge back to sender
                socket.emit('p2p_file_ack', {
                  targetSocketId: data.fromSocketId,
                  jobId: data.jobId,
                  fileName: state.meta?.fileName || 'file',
                  fileSize: blob.size,
                });

                // Clean up connection
                setTimeout(() => {
                  try { pc.close(); } catch {}
                  activePeers.delete(data.jobId);
                }, 1000);
              }
            } catch (jsonErr) {
              console.warn('[P2P Receiver] JSON parse error:', jsonErr);
            }
          } else {
            // Binary chunk received directly over P2P DataChannel!
            const buffer = msgEvent.data as ArrayBuffer;
            state.chunks.push(buffer);
            state.receivedBytes += buffer.byteLength;

            if (state.meta?.fileSize) {
              const percent = Math.min(100, Math.round((state.receivedBytes / state.meta.fileSize) * 100));
              onProgress?.(data.jobId, percent);
            }
          }
        };
      };

      await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.emit('p2p_answer', {
        targetSocketId: data.fromSocketId,
        jobId: data.jobId,
        answer,
      });
    } catch (err) {
      console.error('[P2P Receiver] Failed to handle incoming P2P offer:', err);
    }
  };

  const handleIceCandidate = async (data: { fromSocketId: string; candidate: any; jobId: string }) => {
    const peer = activePeers.get(data.jobId);
    if (peer && peer.pc) {
      try {
        await peer.pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      } catch (e) {
        console.warn('[P2P Receiver] Add ICE candidate error:', e);
      }
    }
  };

  socket.on('p2p_offer_received', handleOffer);
  socket.on('p2p_ice_candidate_received', handleIceCandidate);

  return () => {
    socket.off('p2p_offer_received', handleOffer);
    socket.off('p2p_ice_candidate_received', handleIceCandidate);
    activePeers.forEach(({ pc }) => {
      try { pc.close(); } catch {}
    });
    activePeers.clear();
  };
}
