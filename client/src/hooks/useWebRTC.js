import { useEffect, useRef, useState, useCallback } from 'react';
import socket from '../services/socket';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
    // Public free OpenRelay TURN servers for NAT, cellular, and cross-network traversal
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp'
      ],
      username: 'openrelay',
      credential: 'openrelay'
    }
  ]
};

export function useWebRTC(roomId, currentUser, members = []) {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({}); // { [socketId]: { stream, user } }
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [mediaPermissionGranted, setMediaPermissionGranted] = useState(false);
  const [deviceError, setDeviceError] = useState(null);

  const localStreamRef = useRef(null);
  const peerConnections = useRef({}); // { [socketId]: RTCPeerConnection }
  const makingOffer = useRef({}); // { [socketId]: boolean }
  const ignoreOffer = useRef({}); // { [socketId]: boolean }
  const isSettingRemoteAnswerPending = useRef({}); // { [socketId]: boolean }
  const iceCandidatesQueue = useRef({}); // { [socketId]: RTCIceCandidateInit[] }
  const screenTrackRef = useRef(null);

  const currentUserRef = useRef(currentUser);
  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  // Sync / Attach tracks from a MediaStream into an RTCPeerConnection
  const syncTracksToPC = useCallback((pc, stream) => {
    if (!pc || !stream) return;
    const senders = pc.getSenders();
    stream.getTracks().forEach((track) => {
      const existingSender = senders.find((s) => s.track && s.track.kind === track.kind);
      if (existingSender) {
        if (existingSender.track !== track) {
          existingSender.replaceTrack(track).catch((err) => {
            console.warn('[WebRTC] replaceTrack warning:', err);
          });
        }
      } else {
        try {
          pc.addTrack(track, stream);
        } catch (err) {
          console.warn('[WebRTC] addTrack warning:', err);
        }
      }
    });
  }, []);

  // Drain queued ICE candidates once remoteDescription is set
  const drainIceCandidates = useCallback(async (peerSocketId, pc) => {
    const queue = iceCandidatesQueue.current[peerSocketId];
    if (queue && queue.length > 0) {
      console.log(`[WebRTC] Draining ${queue.length} queued ICE candidate(s) for ${peerSocketId}`);
      for (const candidate of queue) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.warn(`[WebRTC] Error adding queued ICE candidate for ${peerSocketId}:`, err);
        }
      }
      iceCandidatesQueue.current[peerSocketId] = [];
    }
  }, []);

  // Remove Peer Connection and associated state
  const removePeerConnection = useCallback((peerSocketId) => {
    console.log(`[WebRTC] Removing peer connection for ${peerSocketId}`);
    if (peerConnections.current[peerSocketId]) {
      try {
        peerConnections.current[peerSocketId].close();
      } catch (e) {}
      delete peerConnections.current[peerSocketId];
    }
    delete makingOffer.current[peerSocketId];
    delete ignoreOffer.current[peerSocketId];
    delete isSettingRemoteAnswerPending.current[peerSocketId];
    delete iceCandidatesQueue.current[peerSocketId];

    setRemoteStreams((prev) => {
      const copy = { ...prev };
      delete copy[peerSocketId];
      return copy;
    });
  }, []);

  // Create Peer Connection for a specific peer socket
  const createPeerConnection = useCallback((peerSocketId, peerInfo, isInitiator = false) => {
    if (peerConnections.current[peerSocketId]) {
      return peerConnections.current[peerSocketId];
    }

    console.log(`[WebRTC] Creating RTCPeerConnection for ${peerSocketId} (initiator: ${isInitiator})`);
    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnections.current[peerSocketId] = pc;
    iceCandidatesQueue.current[peerSocketId] = iceCandidatesQueue.current[peerSocketId] || [];

    // Add local tracks if already available
    if (localStreamRef.current) {
      syncTracksToPC(pc, localStreamRef.current);
    }

    // Handle incoming remote media tracks
    pc.ontrack = (event) => {
      console.log(`[WebRTC] ontrack from ${peerSocketId}: kind=${event.track?.kind}, id=${event.track?.id}`);
      let remoteStream = event.streams && event.streams[0];
      if (!remoteStream) {
        setRemoteStreams((prev) => {
          let currentStream = prev[peerSocketId]?.stream;
          if (!currentStream) {
            currentStream = new MediaStream();
          }
          if (event.track && !currentStream.getTracks().some((t) => t.id === event.track.id)) {
            currentStream.addTrack(event.track);
          }
          return {
            ...prev,
            [peerSocketId]: {
              stream: currentStream,
              user: peerInfo || prev[peerSocketId]?.user || { name: 'Friend' }
            }
          };
        });
      } else {
        setRemoteStreams((prev) => ({
          ...prev,
          [peerSocketId]: {
            stream: remoteStream,
            user: peerInfo || prev[peerSocketId]?.user || { name: 'Friend' }
          }
        }));
      }

      if (event.track) {
        event.track.onunmute = () => {
          console.log(`[WebRTC] Remote track unmuted (${event.track.kind}) from ${peerSocketId}`);
          setRemoteStreams((prev) => {
            const current = prev[peerSocketId]?.stream || (event.streams && event.streams[0]);
            return {
              ...prev,
              [peerSocketId]: {
                stream: current,
                user: peerInfo || prev[peerSocketId]?.user || { name: 'Friend' }
              }
            };
          });
        };
      }
    };

    // W3C Perfect Negotiation onnegotiationneeded
    pc.onnegotiationneeded = async () => {
      try {
        console.log(`[WebRTC] Negotiation needed with ${peerSocketId}`);
        makingOffer.current[peerSocketId] = true;
        await pc.setLocalDescription();
        socket.emit('webrtc_offer', {
          targetSocketId: peerSocketId,
          offer: pc.localDescription,
          callerInfo: currentUserRef.current
        });
      } catch (err) {
        console.error(`[WebRTC] Error in onnegotiationneeded for ${peerSocketId}:`, err);
      } finally {
        makingOffer.current[peerSocketId] = false;
      }
    };

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('webrtc_ice_candidate', {
          targetSocketId: peerSocketId,
          candidate: event.candidate
        });
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`[WebRTC] ICE state with ${peerSocketId}: ${pc.iceConnectionState}`);
      if (pc.iceConnectionState === 'failed') {
        try {
          pc.restartIce();
        } catch (e) {}
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] Connection state with ${peerSocketId}: ${pc.connectionState}`);
      if (pc.connectionState === 'failed') {
        removePeerConnection(peerSocketId);
      }
    };

    // If designated initiator, create initial offer
    if (isInitiator) {
      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .then(() => {
          socket.emit('webrtc_offer', {
            targetSocketId: peerSocketId,
            offer: pc.localDescription,
            callerInfo: currentUserRef.current
          });
        })
        .catch((err) => console.error('[WebRTC] Error creating initiator offer:', err));
    }

    return pc;
  }, [syncTracksToPC, removePeerConnection]);

  // Initialize Local Media Stream (Camera + Mic) with dynamic track renegotiation
  const initLocalStream = useCallback(async (withVideo = true, withAudio = true) => {
    try {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }

      console.log(`[WebRTC] Requesting getUserMedia: video=${withVideo}, audio=${withAudio}`);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: withVideo ? { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { max: 30 } } : false,
        audio: withAudio ? { echoCancellation: true, noiseSuppression: true } : false
      });

      localStreamRef.current = stream;
      setLocalStream(stream);
      setMediaPermissionGranted(true);
      setDeviceError(null);

      // Attach local tracks to all existing peer connections and renegotiate
      for (const [peerSocketId, pc] of Object.entries(peerConnections.current)) {
        syncTracksToPC(pc, stream);

        // Explicit renegotiation to immediately deliver new tracks to remote peers
        if (pc.signalingState === 'stable') {
          try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit('webrtc_offer', {
              targetSocketId: peerSocketId,
              offer: pc.localDescription,
              callerInfo: currentUserRef.current
            });
            console.log(`[WebRTC] Dispatched renegotiation offer to ${peerSocketId} after acquiring media`);
          } catch (err) {
            console.warn(`[WebRTC] Renegotiation offer warning for ${peerSocketId}:`, err);
          }
        }
      }

      return stream;
    } catch (err) {
      console.warn('[WebRTC] Media device access warning:', err);
      setDeviceError(err.message || 'Could not access camera/mic');
      return null;
    }
  }, [syncTracksToPC]);

  // Toggle Audio (Mute / Unmute)
  const toggleAudio = useCallback(() => {
    if (!localStreamRef.current) return;
    const audioTrack = localStreamRef.current.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setIsAudioMuted(!audioTrack.enabled);
      socket.emit('toggle_media_state', {
        roomId,
        hasAudio: audioTrack.enabled,
        hasVideo: !isVideoMuted
      });
    }
  }, [roomId, isVideoMuted]);

  // Toggle Video (Camera On / Off)
  const toggleVideo = useCallback(() => {
    if (!localStreamRef.current) return;
    const videoTrack = localStreamRef.current.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      setIsVideoMuted(!videoTrack.enabled);
      socket.emit('toggle_media_state', {
        roomId,
        hasAudio: !isAudioMuted,
        hasVideo: videoTrack.enabled
      });
    }
  }, [roomId, isAudioMuted]);

  // Screen Sharing
  const toggleScreenShare = useCallback(async () => {
    if (isScreenSharing) {
      if (screenTrackRef.current) {
        screenTrackRef.current.stop();
        screenTrackRef.current = null;
      }
      setIsScreenSharing(false);
      await initLocalStream(!isVideoMuted, !isAudioMuted);
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true
        });
        const screenTrack = screenStream.getVideoTracks()[0];
        screenTrackRef.current = screenTrack;

        Object.values(peerConnections.current).forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
          if (sender) {
            sender.replaceTrack(screenTrack);
          }
        });

        if (localStreamRef.current) {
          const oldVideo = localStreamRef.current.getVideoTracks()[0];
          if (oldVideo) localStreamRef.current.removeTrack(oldVideo);
          localStreamRef.current.addTrack(screenTrack);
        }

        setIsScreenSharing(true);

        screenTrack.onended = () => {
          setIsScreenSharing(false);
          initLocalStream(!isVideoMuted, !isAudioMuted);
        };
      } catch (err) {
        console.warn('[WebRTC] Screen sharing cancelled or failed:', err);
      }
    }
  }, [isScreenSharing, isVideoMuted, isAudioMuted, initLocalStream]);

  // Socket WebRTC Signaling Listeners
  useEffect(() => {
    if (!roomId) return;

    // Incoming Offer with Perfect Negotiation & Candidate Queue
    const handleOffer = async ({ fromSocketId, offer, callerInfo }) => {
      console.log(`[WebRTC] Received offer from ${fromSocketId}`);
      let pc = peerConnections.current[fromSocketId];
      if (!pc) {
        pc = createPeerConnection(fromSocketId, callerInfo, false);
      }

      // Politeness: string comparison between socket IDs gives deterministic resolution
      const isPolite = socket.id > fromSocketId;
      const readyForOffer = !makingOffer.current[fromSocketId] &&
        (pc.signalingState === 'stable' || isSettingRemoteAnswerPending.current[fromSocketId]);
      const offerCollision = !readyForOffer;

      ignoreOffer.current[fromSocketId] = !isPolite && offerCollision;
      if (ignoreOffer.current[fromSocketId]) {
        console.log(`[WebRTC] Ignoring offer collision from ${fromSocketId} (we are impolite)`);
        return;
      }

      try {
        if (offerCollision && isPolite) {
          console.log(`[WebRTC] Rolling back local description for ${fromSocketId} (we are polite)`);
          await pc.setLocalDescription({ type: 'rollback' });
        }

        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        await drainIceCandidates(fromSocketId, pc);

        // Ensure our current local tracks are attached to this peer
        if (localStreamRef.current) {
          syncTracksToPC(pc, localStreamRef.current);
        }

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit('webrtc_answer', {
          targetSocketId: fromSocketId,
          answer: pc.localDescription
        });
        console.log(`[WebRTC] Dispatched answer to ${fromSocketId}`);
      } catch (err) {
        console.error(`[WebRTC] Error handling offer from ${fromSocketId}:`, err);
      }
    };

    // Incoming Answer
    const handleAnswer = async ({ fromSocketId, answer }) => {
      console.log(`[WebRTC] Received answer from ${fromSocketId}`);
      const pc = peerConnections.current[fromSocketId];
      if (pc) {
        try {
          isSettingRemoteAnswerPending.current[fromSocketId] = true;
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
          isSettingRemoteAnswerPending.current[fromSocketId] = false;

          await drainIceCandidates(fromSocketId, pc);
        } catch (err) {
          console.error(`[WebRTC] Error setting remote description from answer:`, err);
        }
      }
    };

    // Incoming ICE Candidate with queueing
    const handleIceCandidate = async ({ fromSocketId, candidate }) => {
      if (!candidate) return;
      const pc = peerConnections.current[fromSocketId];
      if (!pc || !pc.remoteDescription || !pc.remoteDescription.type) {
        if (!iceCandidatesQueue.current[fromSocketId]) {
          iceCandidatesQueue.current[fromSocketId] = [];
        }
        iceCandidatesQueue.current[fromSocketId].push(candidate);
        return;
      }

      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        if (!ignoreOffer.current[fromSocketId]) {
          console.warn(`[WebRTC] Error adding ICE candidate from ${fromSocketId}:`, err);
        }
      }
    };

    // User joined: initiate connection to the new joiner
    const handleUserJoined = ({ user }) => {
      if (user.socketId && user.socketId !== socket.id) {
        console.log(`[WebRTC] User joined room, initiating connection to: ${user.name} (${user.socketId})`);
        createPeerConnection(user.socketId, user, true);
      }
    };

    // Authoritative members list update: guarantee full mesh with all active members
    const handleMembersUpdated = ({ members: memberList }) => {
      if (!Array.isArray(memberList)) return;
      memberList.forEach((m) => {
        if (m.socketId && m.socketId !== socket.id && !peerConnections.current[m.socketId]) {
          const shouldInitiate = socket.id < m.socketId;
          console.log(`[WebRTC] Found unpeered room member: ${m.name} (${m.socketId}), initiator=${shouldInitiate}`);
          createPeerConnection(m.socketId, m, shouldInitiate);
        }
      });
    };

    // User left: close and clean up
    const handleUserLeft = ({ socketId }) => {
      console.log(`[WebRTC] User left room: ${socketId}`);
      removePeerConnection(socketId);
    };

    socket.on('webrtc_offer', handleOffer);
    socket.on('webrtc_answer', handleAnswer);
    socket.on('webrtc_ice_candidate', handleIceCandidate);
    socket.on('user_joined', handleUserJoined);
    socket.on('members_updated', handleMembersUpdated);
    socket.on('user_left', handleUserLeft);

    return () => {
      socket.off('webrtc_offer', handleOffer);
      socket.off('webrtc_answer', handleAnswer);
      socket.off('webrtc_ice_candidate', handleIceCandidate);
      socket.off('user_joined', handleUserJoined);
      socket.off('members_updated', handleMembersUpdated);
      socket.off('user_left', handleUserLeft);
    };
  }, [roomId, createPeerConnection, drainIceCandidates, removePeerConnection, syncTracksToPC]);

  // Mesh check when members prop changes
  useEffect(() => {
    if (!Array.isArray(members) || members.length === 0) return;
    members.forEach((m) => {
      if (m.socketId && m.socketId !== socket.id && !peerConnections.current[m.socketId]) {
        const shouldInitiate = socket.id < m.socketId;
        createPeerConnection(m.socketId, m, shouldInitiate);
      }
    });
  }, [members, createPeerConnection]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      Object.keys(peerConnections.current).forEach((id) => {
        try {
          peerConnections.current[id].close();
        } catch (e) {}
      });
      peerConnections.current = {};
    };
  }, []);

  return {
    localStream,
    remoteStreams,
    isAudioMuted,
    isVideoMuted,
    isScreenSharing,
    mediaPermissionGranted,
    deviceError,
    initLocalStream,
    toggleAudio,
    toggleVideo,
    toggleScreenShare
  };
}
