Batalla de Códigos

Juego web multijugador en tiempo real (2 jugadores) de adivinar un código secreto de 4 dígitos, con turnos, conteo de aciertos y desempate automático. Frontend puro (HTML/CSS/JS) + Firebase (Auth anónima + Firestore). Ideal para jugar desde el celu o la compu, sin instalar nada.

🕹️ ¿De qué va?

Cada jugador define un código de 4 dígitos. En su turno, propone un intento; el rival devuelve “Aciertos: N” (cuántos dígitos correctos en la posición correcta, sin revelar cuáles). Si quien empieza acierta en k intentos, el otro tiene hasta k para empatar; si no llega, gana el primero. Al finalizar, el ganador publica su código para que el perdedor vea qué tan cerca estuvo.

✨ Características

Salas por código (manual o generado aleatorio) y link de invitación.

Tiempo por turno con barra/segundos (configurable).

Soniditos (on/off) y UI responsive con historial por lado y toggles en mobile.

“Partida nueva” con limpieza segura (no pisa nombres del otro jugador).

Reglas integradas (modal de ayuda) y reinicio de partida.

Privacidad: tu secreto no se sube a la nube; solo se guardan intentos/estados.

🧱 Stack

HTML5 + CSS3 (sin frameworks)

JavaScript ES Modules

Firebase: Auth anónima + Firestore (suscripciones en tiempo real)
