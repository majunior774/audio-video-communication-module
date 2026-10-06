import React from 'react';
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

  //video audio connection
  useEffect(() => {

      const startCamera = async () => {

          const stream = await navigator.mediaDevices.getUserMedia({
              video: true,
              audio: true
          });
          localVideoRef.current.srcObject = stream;

          // adding local video on RTC peer 
          peerRef.current = new RTCPeerConnection();
          stream.getTracks().forEach((tracks)=>{
            peerRef.current.addTrack(tracks,stream);
          })
          peerRef.current.ontrack = (e)=>{
            remoteVideoRef.current.srcObject = e.streams[0];
          }
      };

      startCamera();

  }, []);

  // signalling connection
  useEffect(() => {
    socketRef.current = io(serverUrl, {
        transports: ["websocket"]
    });

    socketRef.current.on("connect",()=>{
      alert(`connected${socketRef.current.id}`);
      socketRef.current.emit("join-room","abc123");
    })
    socketRef.current.on("connect_error",(error)=>{
      console.error('Socket connection failed:', error.message);
    })

    socketRef.current.on("user-joined", (userId) => {
        alert(`new user joined ${userId}`);
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

       const answer = await peerRef.current.createAnswer();
       await peerRef.current.setLocalDescription(answer);

      socketRef.current.emit("answer",{
        answer:peerRef.current.localDescription,
        target:from
      });
    })
    socketRef.current.on("answer",({answer,from})=>{
      peerRef.current.setRemoteDescription(answer);
      console.log("connection done with :", from);
    })
    //candidate validation
    socketRef.current.on("candidate", async ({ candidate, from }) => {
      try {
        await peerRef.current.addIceCandidate(candidate);
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
      alert(`disconnect${socketRef.current.id}`);
    })

    return () => socketRef.current.disconnect();
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
