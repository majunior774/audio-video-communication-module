import React from 'react';
import {useEffect,useRef} from 'react';
import './App.css';
import {io} from "socket.io-client";



function App() {
  // signalling

  const serverUrl = import.meta.env.VITE_SERVER_URL;
  
  useEffect(() => {
    const socket=io(serverUrl);
    socket.on("connect",()=>{
      alert(`connected${socket.id}`);
      socket.emit("join-room","abc123");
    })
    socket.on("connect_error",(error)=>{
      console.error('Socket connection failed:', error.message);
    })

    socket.on("user-joined", (userId) => {
        alert(`new user joined ${userId}`);
    });

    socket.on("existing-users", (users) => {
        console.log("Existing users:", users);
    });
    
    socket.on("disconnect",()=>{
      alert(`disconnect${socket.id}`);
    })

    return () => socket.disconnect();
  }, [])

  //video audio connection
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  useEffect(() => {

      const startCamera = async () => {

          const stream = await navigator.mediaDevices.getUserMedia({
              video: true,
              audio: true
          });

          localVideoRef.current.srcObject = stream;
      };

      startCamera();

  }, []);
  return (
    < >
      <div className="flex flex-col items-center justify-center min-h-screen bg-black w-full h-full">
        <h1 className=" text-gray-300 text-2xl font-bold">Minor Project </h1>
        <h2 className=" text-gray-300 text-lg font-semibold">Audio-Video Communication Module</h2>
        <h3 className=" text-gray-300 text-md font-normal"> Developed by: Ayush and Sumit </h3>
        <video
            ref={localVideoRef}
            autoPlay
            muted
            className='scale-x-[-1] '
        />
        <video
            ref={remoteVideoRef}
            autoPlay
        />
      </div>
    </>
  )
}

export default App
