
import {useEffect,useRef} from 'react';
import './App.css';
import {io} from "socket.io-client";



function App() {
  //DECLARATIONS
  // signalling 
  const serverUrl = import.meta.env.VITE_SERVER_URL;
  const socketRef=useRef(null);
  //video audio 
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteUserRef = useRef(null);
  const mediaReadyRef = useRef(null);
  const pendingCandidatesRef = useRef([]);

  //video audio connection
  useEffect(() => {
      let cancelled = false;
      const localVideo = localVideoRef.current;

      const startCamera = async () => {

          const stream = await navigator.mediaDevices.getUserMedia({
              video: true,
              audio: true
          });
          if (cancelled) {
            stream.getTracks().forEach((track)=>track.stop());
            return;
          }
          localStreamRef.current = stream;
          if (localVideo) {
            localVideo.srcObject = stream;
          }

          // adding local video on RTC peer 
          peerRef.current = new RTCPeerConnection({
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
            ],
          });
          
          stream.getTracks().forEach((tracks)=>{
            peerRef.current.addTrack(tracks,stream);
          })
          peerRef.current.ontrack = (e)=>{
            remoteVideoRef.current.srcObject = e.streams[0];
          }
      };

      mediaReadyRef.current = startCamera();

      return () => {
          cancelled = true;
          localVideo?.srcObject?.getTracks().forEach((track)=>track.stop());
          if (localVideo) {
            localVideo.srcObject = null;
          }
          localStreamRef.current = null;
          peerRef.current?.close();
          peerRef.current = null;
          remoteUserRef.current = null;
          pendingCandidatesRef.current = [];
      };

  }, []);

  // signalling connection
  useEffect(() => {
    let cancelled = false;

    mediaReadyRef.current
      .then(() => {
    if (cancelled) return;

    socketRef.current = io(serverUrl, {
        transports: ["websocket"]
    });
    const addPendingCandidates = async () => {
      for (const candidate of pendingCandidatesRef.current) {
        try {
          await peerRef.current.addIceCandidate(candidate);
        } catch (error) {
          console.error("Failed to add queued ICE candidate:", error);
        }
      }
      pendingCandidatesRef.current = [];
    };
    const configurePeerConnection = (peer) => {
      peer.onicecandidate = (e) => {
        if (e.candidate && remoteUserRef.current) {
          socketRef.current.emit("candidate", {
            candidate: e.candidate,
            target: remoteUserRef.current
          });
        }
      };
      peer.ontrack = (e) => {
        console.log("🔥 REMOTE TRACK:", e.streams[0]);
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = e.streams[0];
        }
      };
      peer.onconnectionstatechange = () => {
        console.log("CONNECTION:", peer.connectionState);
      };
      peer.oniceconnectionstatechange = () => {
        console.log("ICE:", peer.iceConnectionState);
      };
    };
    const ensurePeerConnection = () => {
      if (!peerRef.current || peerRef.current.signalingState === "closed") {
        const peer = new RTCPeerConnection({
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
          ],
        });
        localStreamRef.current.getTracks().forEach((track) => {
          peer.addTrack(track, localStreamRef.current);
        });
        peerRef.current = peer;
        configurePeerConnection(peer);
      }
      return peerRef.current;
    };
    configurePeerConnection(peerRef.current);
    socketRef.current.on("connect",()=>{
      console.log(`Connected: ${socketRef.current.id}`);
      socketRef.current.emit("join-room","abc123");
    })
    socketRef.current.on("connect_error",(error)=>{
      console.error('Socket connection failed:', error.message);
    })

    socketRef.current.on("user-joined", (userId) => {
        console.log(`New user joined: ${userId}`);
    });
    socketRef.current.on("user-left", (userId) => {
      console.log(`User left: ${userId}`);
      if (remoteUserRef.current === userId) {
        peerRef.current?.close();
        peerRef.current = null;
        remoteUserRef.current = null;
        pendingCandidatesRef.current = [];
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = null;
        }
      }
    });
    
    // webRtc connection

    socketRef.current.on("existing-users", (users) => {
      console.log("Existing users:", users);
      users.forEach(async (Id)=>{
          try {
            remoteUserRef.current = Id;
            const peer = ensurePeerConnection();
            //offering 
            const offer = await peer.createOffer();
            await peer.setLocalDescription(offer);
            
            socketRef.current.emit("offer",{
              offer,
              target : Id
            });

            
          } catch (error) {
            console.log("Failed to create offer:", error);
          }
        })
    });
    socketRef.current.on("offer",async ({offer,from})=>{

      remoteUserRef.current = from;
      const peer = ensurePeerConnection();

      await peer.setRemoteDescription(offer);
      await addPendingCandidates();

       const answer = await peer.createAnswer();
       await peer.setLocalDescription(answer);

      socketRef.current.emit("answer",{
        answer,
        target:from
      });
    })
    socketRef.current.on("answer",async ({answer,from})=>{
      remoteUserRef.current = from;
      const peer = ensurePeerConnection();
      await peer.setRemoteDescription(answer);
      await addPendingCandidates();
      console.log("connection done with :", from);
    })
    //candidate validation
    socketRef.current.on("candidate", async ({ candidate, from }) => {
      try {
        remoteUserRef.current = from;
        const peer = ensurePeerConnection();
        if (peer.remoteDescription) {
          await peer.addIceCandidate(candidate);
        } else {
          pendingCandidatesRef.current.push(candidate);
        }
        console.log(`talking with ${from} on`, candidate);
      }catch (error) {
        console.error("Failed to add ICE candidate:", error);
      }
    });





    socketRef.current.on("disconnect",()=>{
      console.log(`Disconnected: ${socketRef.current.id}`);
    })

      })
      .catch((error) => {
        console.error("Failed to initialize media before signaling:", error);
      });

    return () => {
      cancelled = true;
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [serverUrl])


  
  return (
    < >
      <div className="flex flex-col items-center justify-center min-h-screen bg-black w-full h-full">
        <h1 className=" text-gray-300 text-2xl font-bold">Minor Project </h1>
        <h2 className=" text-gray-300 text-lg font-semibold">Audio-Video Communication Module</h2>
        <h3 className=" text-gray-300 text-md font-normal"> Developed by: Ayush and Sumit </h3>
        <video
            ref={localVideoRef}
            autoPlay
            controls
            muted
            className='scale-x-[-1]'
        />
        <video
            ref={remoteVideoRef}
            autoPlay
            controls
        />
      </div>
    </>
  )
}

export default App
