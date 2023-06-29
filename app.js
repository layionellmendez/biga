// Configurar la inicialización de Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-analytics.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { getFirestore, collection, doc, addDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCDrX11llpK8_aTZx0VzybjjExAB3BAZuM",
    authDomain: "biga-five.firebaseapp.com",
    projectId: "biga-five",
    storageBucket: "biga-five.appspot.com",
    messagingSenderId: "490371818645",
    appId: "1:490371818645:web:5aee138dc769dd91e0679c",
    measurementId: "G-Q7N5GQKEB8"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth();
const firestore = getFirestore();

// Variables globales
let currentUser;
let localConnection;
let dataChannel;

function login() {
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;

  signInWithEmailAndPassword(auth, email, password)
    .then((userCredential) => {
      currentUser = userCredential.user;
      document.getElementById('login').style.display = 'none';
      document.getElementById('chat').style.display = 'block';
      setupDataChannel();
    })
    .catch((error) => {
      console.error('Error al iniciar sesión:', error);
    });
}

function logout() {
  signOut(auth)
    .then(() => {
      currentUser = null;
      document.getElementById('chat').style.display = 'none';
      document.getElementById('login').style.display = 'block';
      document.getElementById('email').value = '';
      document.getElementById('password').value = '';
    })
    .catch((error) => {
      console.error('Error al cerrar sesión:', error);
    });
}

function sendMessage() {
  const message = document.getElementById('message').value;
  dataChannel.send(message);
  document.getElementById('message').value = '';
  addMessage('Yo', message);
}

function addMessage(username, message) {
  const messagesContainer = document.getElementById('messages');
  const messageElement = document.createElement('div');
  messageElement.textContent = `${username}: ${message}`;
  messagesContainer.appendChild(messageElement);
}

function setupDataChannel() {
  // Configurar la conexión local
  localConnection = new RTCPeerConnection();

  // Crear un canal de datos
  dataChannel = localConnection.createDataChannel('chat');

  // Escuchar mensajes entrantes
  dataChannel.onmessage = (event) => {
    addMessage('Usuario Anónimo', event.data);
  };

  // Configurar la conexión remota
  const remoteConnection = new RTCPeerConnection();

  // Establecer la descripción de la conexión remota
  localConnection.onicecandidate = (event) => {
    if (event.candidate) {
      remoteConnection.addIceCandidate(event.candidate);
    }
  };

  remoteConnection.onicecandidate = (event) => {
    if (event.candidate) {
      localConnection.addIceCandidate(event.candidate);
    }
  };

  localConnection.createOffer()
    .then((offer) => {
      localConnection.setLocalDescription(offer);
      remoteConnection.setRemoteDescription(offer);
      return remoteConnection.createAnswer();
    })
    .then((answer) => {
      remoteConnection.setLocalDescription(answer);
      localConnection.setRemoteDescription(answer);
    })
    .catch((error) => {
      console.error('Error al establecer la conexión:', error);
    });

  // Guardar la descripción de la conexión en Firestore
  addDoc(collection(firestore, 'connections'), {
    userId: currentUser.uid,
    offer: localConnection.localDescription.toJSON()
  });

  // Eliminar la información de conexión si el usuario está inactivo por más de 5 días
  const userDocRef = doc(firestore, 'users', currentUser.uid);
  const now = new Date();
  const expirationDate = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000); // 5 días en milisegundos
  const unsubscribe = onSnapshot(userDocRef, (doc) => {
    if (doc.exists()) {
      const lastActive = doc.data().lastActive;
      if (!lastActive || lastActive.toDate() < expirationDate) {
        unsubscribe();
        userDocRef.delete();
      }
    }
  });

  // Actualizar la última fecha de actividad del usuario
  userDocRef.set({
    lastActive: now
  });
}

// Escuchar las conexiones nuevas en Firestore
onSnapshot(collection(firestore, 'connections'), (snapshot) => {
  snapshot.docChanges().forEach((change) => {
    if (change.type === 'added') {
      const connection = change.doc.data();
      if (connection.userId !== currentUser.uid && connection.offer) {
        const remoteConnection = new RTCPeerConnection();
        remoteConnection.setRemoteDescription(connection.offer);

        remoteConnection.onicecandidate = (event) => {
          if (event.candidate) {
            localConnection.addIceCandidate(event.candidate);
          }
        };

        localConnection.onicecandidate = (event) => {
          if (event.candidate) {
            remoteConnection.addIceCandidate(event.candidate);
          }
        };

        localConnection.setRemoteDescription(connection.offer);
        localConnection.createAnswer()
          .then((answer) => {
            localConnection.setLocalDescription(answer);
            remoteConnection.setRemoteDescription(answer);
          })
          .catch((error) => {
            console.error('Error al establecer la conexión:', error);
          });
      }
    }
  });
});
