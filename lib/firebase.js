import { initializeApp, getApps, getApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyC0wUW3JxNtZGSTFYirpHcc06E5w7E4WNw",
  authDomain: "difference-game-520c0.firebaseapp.com",
  databaseURL: "https://difference-game-520c0-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "difference-game-520c0",
  storageBucket: "difference-game-520c0.firebasestorage.app",
  messagingSenderId: "644692926974",
  appId: "1:644692926974:web:85c39c0262363ad30d60af",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const db = getDatabase(app);
