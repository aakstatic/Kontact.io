import React, { useState, useEffect } from "react";
import axios from "axios";
import randomTypeOfName from "../typeOfNamesLink";

export default function GameArea() {
  const [roomCode, setRoomCode] = useState("");
  const [name, setName] = useState("");
  return (
    <div>
      <input
        type="text"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
        }}
      ></input>
      <input
        type="text"
        value={roomCode}
        onChange={(e) => {
          setRoomCode(e.target.value);
        }}
      ></input>
      <button>Submit</button>
    </div>
  );
}
