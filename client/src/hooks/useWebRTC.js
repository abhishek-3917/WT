import { useEffect, useRef, useState, useCallback } from 'react';
import socket from '../services/socket';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.services.mozilla.com' }
  ]
};

export function useWebRTC(roomId, currentUser) {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({}); // { [socketId]: { stream, user } }
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [mediaPermissionGranted, setMediaPermissionGranted] = useState(false);
  const [deviceError, setDeviceError] = useState(null);

  const localStreamRef = useRef(null);
  const peerConnections = useRef({}); // { [socketId]: RTCPeerConnection }
  const screenTrackRef = useRef(null);

  // Initialize Local Media Stream (Camera + Mic)
  const initLocalStream = useCallback(async (withVideo = true, withAudio = true) => {
    try {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: withVideo ? { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { max: 30 } } : false,
        audio: withAudio ? { echoCancellation: true, noiseSuppression: true } : false
      });

      localStreamRef.current = stream;
      setLocalStream(stream);
      setMediaPermissionGranted(true);
      setDeviceError(null);

      // Add local tracks to all existing peer connections
      Object.keys(peerConnections.current).forEach((peerSocketId) => {
        const pc = peerConnections.current[peerSocketId];
        stream.getTracks().forEach((track) => {
          pc.addTrack(track, stream);
        });
      });

      return stream;
    } catch (err) {
      console.warn('[WebRTC] Media device access warning:', err);
      setDeviceError(err.message || 'Could not access camera/mic');
      return null;
    }
  }, []);

  // Create Peer Connection for a specific peer socket
  const createPeerConnection = useCallback((peerSocketId, peerInfo, isInitiator) => {
    if (peerConnections.current[peerSocketId]) {
      return peerConnections.current[peerSocketId];
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnections.current[peerSocketId] = pc;

    // Add local tracks if available
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    // Handle incoming remote media tracks
    pc.ontrack = (event) => {
      console.log(`[WebRTC] Received remote stream track from ${peerSocketId}`);
      const [remoteStream] = event.streams;
      setRemoteStreams((prev) => ({
        ...prev,
        [peerSocketId]: {
          stream: remoteStream,
          user: peerInfo || prev[peerSocketId]?.user || { name: 'Friend' }
        }
      }));
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

    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] Connection state with ${peerSocketId}: ${pc.connectionState}`);
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        removePeerConnection(peerSocketId);
      }
    };

    // If this peer is initiator, create offer
    if (isInitiator) {
      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .then(() => {
          socket.emit('webrtc_offer', {
            targetSocketId: peerSocketId,
            offer: pc.localDescription,
            callerInfo: currentUser
          });
        })
        .catch((err) => console.error('[WebRTC] Error creating offer:', err));
    }

    return pc;
  }, [currentUser]);

  const removePeerConnection = useCallback((peerSocketId) => {
    if (peerConnections.current[peerSocketId]) {
      peerConnections.current[peerSocketId].close();
      delete peerConnections.current[peerSocketId];
    }
    setRemoteStreams((prev) => {
      const copy = { ...prev };
      delete copy[peerSocketId];
      return copy;
    });
  }, []);

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
      // Revert to camera
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

        // Replace video track in peer connections
        Object.values(peerConnections.current).forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
          if (sender) {
            sender.replaceTrack(screenTrack);
          }
        });

        // Update local stream preview
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

    // Incoming Offer
    const handleOffer = async ({ fromSocketId, offer, callerInfo }) => {
      console.log(`[WebRTC] Received offer from ${fromSocketId}`);
      let pc = peerConnections.current[fromSocketId];
      if (!pc) {
        pc = createPeerConnection(fromSocketId, callerInfo, false);
      }

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit('webrtc_answer', {
          targetSocketId: fromSocketId,
          answer: pc.localDescription
        });
      } catch (err) {
        console.error('[WebRTC] Error handling offer:', err);
      }
    };

    // Incoming Answer
    const handleAnswer = async ({ fromSocketId, answer }) => {
      console.log(`[WebRTC] Received answer from ${fromSocketId}`);
      const pc = peerConnections.current[fromSocketId];
      if (pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
        } catch (err) {
          console.error('[WebRTC] Error setting remote description from answer:', err);
        }
      }
    };

    // Incoming ICE Candidate
    const handleIceCandidate = async ({ fromSocketId, candidate }) => {
      const pc = peerConnections.current[fromSocketId];
      if (pc && candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error('[WebRTC] Error adding ICE candidate:', err);
        }
      }
    };

    // New user joined: Initiate WebRTC call to them
    const handleUserJoined = ({ user }) => {
      if (user.socketId !== socket.id) {
        console.log(`[WebRTC] User joined room, initiating connection to: ${user.name} (${user.socketId})`);
        createPeerConnection(user.socketId, user, true);
      }
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
    socket.on('user_left', handleUserLeft);

    return () => {
      socket.off('webrtc_offer', handleOffer);
      socket.off('webrtc_answer', handleAnswer);
      socket.off('webrtc_ice_candidate', handleIceCandidate);
      socket.off('user_joined', handleUserJoined);
      socket.off('user_left', handleUserLeft);
    };
  }, [roomId, createPeerConnection, removePeerConnection]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      Object.keys(peerConnections.current).forEach((id) => {
        peerConnections.current[id].close();
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

