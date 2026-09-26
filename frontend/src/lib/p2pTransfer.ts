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
 * Socket Relay Fallback (Phase 3B)
 * If WebRTC DataChannel fails or is blocked by strict NAT / cellular firewalls,
 * chunks the file into 64KB buffers and relays ephemeral memory buffers directly
 * via the shop's socket room. Zero server disk persistence.
 */
export async function sendSocketRelayFile(
  socket: Socket,
  shopId: string,
  jobId: string,
  file: File,
  onProgress?: (percent: number) => void
): Promise<boolean> {
  try {
    const totalSize = file.size;
    const totalChunks = Math.ceil(totalSize / CHUNK_SIZE);
    let offset = 0;
    let chunkIndex = 0;

    const metadata = {
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || 'application/pdf',
    };

    while (offset < totalSize) {
      const slice = file.slice(offset, offset + CHUNK_SIZE);
      const buffer = await slice.arrayBuffer();

      socket.emit('relay_file_chunk', {
        shopId,
        jobId,
        chunkIndex,
        totalChunks,
        data: buffer,
        metadata,
      });

      offset += buffer.byteLength;
      chunkIndex++;
      const percent = Math.min(100, Math.round((offset / totalSize) * 100));
      onProgress?.(percent);

      if (chunkIndex % 5 === 0) {
        await new Promise((r) => setTimeout(r, 10));
      }
    }

    socket.emit('relay_file_complete', { shopId, jobId });
    console.log(`[Socket Relay] Successfully relayed file for job ${jobId} to shop ${shopId} (${totalChunks} chunks)`);
    return true;
  } catch (err) {
    console.error('[Socket Relay] Error during socket relay:', err);
    return false;
  }
}

/**
 * Customer Mobile -> Shop PC
 * Sends a file directly to the shopkeeper's browser via WebRTC DataChannel.
 * If WebRTC fails or times out, seamlessly falls back to ephemeral Socket Relay.
 */
export async function sendP2PFile(
  socket: Socket,
  shopId: string,
  jobId: string,
  file: File,
  onProgress?: (percent: number) => void,
  timeoutMs: number = 3500
): Promise<boolean> {
  const tryWebRTC = (): Promise<boolean> => {
    if (typeof window === 'undefined' || !window.RTCPeerConnection) {
      return Promise.resolve(false);
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

      const timer = setTimeout(() => {
        console.warn('[P2P] WebRTC connection timed out. Falling back to Socket Relay.');
        finish(false);
      }, timeoutMs);

      try {
        pc = new RTCPeerConnection(ICE_SERVERS);
        dc = pc.createDataChannel('printspot_file_transfer', { ordered: true });
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

        dc.onopen = async () => {
          console.log('[P2P] Direct DataChannel opened! Streaming file directly to shopkeeper PC...');
          if (!dc) return;

          const header = JSON.stringify({
            type: 'header',
            jobId,
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type || 'application/octet-stream',
          });
          dc.send(header);

          let offset = 0;
          const totalSize = file.size;

          const sendNextChunk = () => {
            if (!dc || dc.readyState !== 'open') return;

            while (offset < totalSize) {
              if (dc.bufferedAmount > MAX_BUFFERED_AMOUNT) {
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
                    dc.send(JSON.stringify({ type: 'eof', jobId }));
                    console.log('[P2P] Finished streaming all bytes. Waiting for counter ack.');
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
  };

  const p2pOk = await tryWebRTC();
  if (p2pOk) return true;

  console.log('[P2P File Transfer] WebRTC unavailable or timed out. Activating Socket Relay fallback...');
  return await sendSocketRelayFile(socket, shopId, jobId, file, onProgress);
}

/**
 * Shop PC Relay Receiver (Phase 3C)
 * Receives ephemeral file chunks over Socket.IO and reassembles them into local Blobs.
 */
export function initRelayReceiver(
  socket: Socket,
  onFileReceived: (jobId: string, blobUrl: string, metadata: P2PFileMetadata) => void,
  onProgress?: (jobId: string, percent: number) => void
): () => void {
  const activeRelays = new Map<string, { chunks: ArrayBuffer[]; meta: P2PFileMetadata | null; receivedBytes: number }>();

  const handleChunk = (data: {
    fromSocketId: string;
    jobId: string;
    chunkIndex: number;
    totalChunks: number;
    data: ArrayBuffer;
    metadata: { fileName: string; fileSize: number; mimeType: string };
  }) => {
    let state = activeRelays.get(data.jobId);
    if (!state) {
      state = {
        chunks: [],
        meta: {
          jobId: data.jobId,
          fileName: data.metadata.fileName,
          fileSize: data.metadata.fileSize,
          mimeType: data.metadata.mimeType,
        },
        receivedBytes: 0,
      };
      activeRelays.set(data.jobId, state);
    }

    state.chunks[data.chunkIndex] = data.data;
    state.receivedBytes += (data.data?.byteLength || 0);

    if (state.meta?.fileSize) {
      const percent = Math.min(100, Math.round((state.receivedBytes / state.meta.fileSize) * 100));
      onProgress?.(data.jobId, percent);
    }
  };

  const handleComplete = (data: { fromSocketId: string; jobId: string }) => {
    const state = activeRelays.get(data.jobId);
    if (!state) return;

    const blob = new Blob(state.chunks, { type: state.meta?.mimeType || 'application/pdf' });
    const blobUrl = URL.createObjectURL(blob);
    console.log(`[Relay Receiver] Assembled relay file ${state.meta?.fileName} (${blob.size} bytes). Local URL ready.`);

    onFileReceived(data.jobId, blobUrl, state.meta || {
      jobId: data.jobId,
      fileName: 'document.pdf',
      fileSize: blob.size,
      mimeType: blob.type,
    });

    activeRelays.delete(data.jobId);
  };

  socket.on('relay_file_chunk_received', handleChunk);
  socket.on('relay_file_complete', handleComplete);

  return () => {
    socket.off('relay_file_chunk_received', handleChunk);
    socket.off('relay_file_complete', handleComplete);
    activeRelays.clear();
  };
}

/**
 * Combined Receiver (WebRTC + Socket Relay fallback)
 */
export function initP2PReceiver(
  socket: Socket,
  onFileReceived: (jobId: string, blobUrl: string, metadata: P2PFileMetadata) => void,
  onProgress?: (jobId: string, percent: number) => void
): () => void {
  const activePeers = new Map<string, { pc: RTCPeerConnection; chunks: ArrayBuffer[]; meta: P2PFileMetadata | null; receivedBytes: number }>();

  const handleOffer = async (data: { fromSocketId: string; jobId: string; offer: any; metadata: any }) => {
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
                const blob = new Blob(state.chunks, { type: state.meta?.mimeType || 'application/pdf' });
                const blobUrl = URL.createObjectURL(blob);
                onFileReceived(data.jobId, blobUrl, state.meta || {
                  jobId: data.jobId,
                  fileName: 'document.pdf',
                  fileSize: blob.size,
                  mimeType: blob.type,
                });
                socket.emit('p2p_file_ack', {
                  targetSocketId: data.fromSocketId,
                  jobId: data.jobId,
                  fileName: state.meta?.fileName || 'file',
                  fileSize: blob.size,
                });
                setTimeout(() => {
                  try { pc.close(); } catch {}
                  activePeers.delete(data.jobId);
                }, 1000);
              }
            } catch (jsonErr) {
              console.warn('[P2P Receiver] JSON parse error:', jsonErr);
            }
          } else {
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

  // Seamlessly hook up Socket Relay receiver
  const cleanupRelay = initRelayReceiver(socket, onFileReceived, onProgress);

  return () => {
    socket.off('p2p_offer_received', handleOffer);
    socket.off('p2p_ice_candidate_received', handleIceCandidate);
    activePeers.forEach(({ pc }) => {
      try { pc.close(); } catch {}
    });
    activePeers.clear();
    cleanupRelay();
  };
}
