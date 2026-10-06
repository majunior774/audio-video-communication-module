
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
  const mediaReadyRef = useRef(null);
  const pendingCandidatesRef = useRef([]);

  //video audio connection
  useEffect(() => {
      let cancelled = false;

      const startCamera = async () => {

          const stream = await navigator.mediaDevices.getUserMedia({
              video: true,
              audio: true
          });
          if (cancelled) {
            stream.getTracks().forEach((track)=>track.stop());
            return;
          }
          localVideoRef.current.srcObject = stream;

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
          localVideoRef.current?.srcObject?.getTracks().forEach((track)=>track.stop());
          peerRef.current?.close();
          peerRef.current = null;
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
    const waitForIceGatheringComplete = () => new Promise((resolve) => {
      if (peerRef.current.iceGatheringState === "complete") {
        resolve();
        return;
      }

      const onIceGatheringStateChange = () => {
        if (peerRef.current.iceGatheringState === "complete") {
          peerRef.current.removeEventListener(
            "icegatheringstatechange",
            onIceGatheringStateChange
          );
          resolve();
        }
      };

      peerRef.current.addEventListener(
        "icegatheringstatechange",
        onIceGatheringStateChange
      );
    });

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
    
    // webRtc connection

    socketRef.current.on("existing-users", (users) => {
      console.log("Existing users:", users);
      users.forEach(async (Id)=>{
          try {
            // ice candidates finding
            peerRef.current.onicecandidate = (e)=>{
              if(e.candidate){
                socketRef.current.emit("candidate",{
                  candidate:e.candidate,
                  target:Id
                })
              }
            }
            //offering 
            const offer = await peerRef.current.createOffer();
            await peerRef.current.setLocalDescription(offer);
            await waitForIceGatheringComplete();
            
            socketRef.current.emit("offer",{
              offer : peerRef.current.localDescription,
              target : Id
            });

            
          } catch (error) {
            console.log("Failed to create offer:", error);
          }
        })
    });
    socketRef.current.on("offer",async ({offer,from})=>{

      peerRef.current.onicecandidate = (e) => {
          if (e.candidate) {
              socketRef.current.emit("candidate", {
                  candidate: e.candidate,
                  target: from
              });
          }
      };

      await peerRef.current.setRemoteDescription(offer);
      await addPendingCandidates();

       const answer = await peerRef.current.createAnswer();
       await peerRef.current.setLocalDescription(answer);
       await waitForIceGatheringComplete();

      socketRef.current.emit("answer",{
        answer:peerRef.current.localDescription,
        target:from
      });
    })
    socketRef.current.on("answer",async ({answer,from})=>{
      await peerRef.current.setRemoteDescription(answer);
      await addPendingCandidates();
      console.log("connection done with :", from);
    })
    //candidate validation
    socketRef.current.on("candidate", async ({ candidate, from }) => {
      try {
        if (peerRef.current.remoteDescription) {
          await peerRef.current.addIceCandidate(candidate);
        } else {
          pendingCandidatesRef.current.push(candidate);
        }
        console.log(`talking with ${from} on`, candidate);
      }catch (error) {
        console.error("Failed to add ICE candidate:", error);
      }
    });





    peerRef.current.onconnectionstatechange = () => {
        console.log(
            "CONNECTION:",
            peerRef.current.connectionState
        );
    };

    peerRef.current.oniceconnectionstatechange = () => {
        console.log(
            "ICE:",
            peerRef.current.iceConnectionState
        );
    };
    peerRef.current.ontrack = (e) => {
        console.log("🔥 REMOTE TRACK:", e.streams[0]);

        remoteVideoRef.current.srcObject = e.streams[0];
    };




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
  }, [])


  
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
