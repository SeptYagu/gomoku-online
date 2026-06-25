import type { Locale } from "./config";

export type GameDictionary = {
  appName: string;
  heroTitle: string;
  controls: {
    reset: string;
    undo: string;
    language: string;
    theme: string;
    lightTheme: string;
    darkTheme: string;
  };
  modes: {
    label: string;
    local: string;
    ai: string;
    room: string;
  };
  ai: {
    difficultyLabel: string;
    normal: string;
    hard: string;
    expert: string;
    insane: string;
    firstPlayerLabel: string;
    humanFirst: string;
    aiFirst: string;
    playerBlackAiWhite: string;
    playerWhiteAiBlack: string;
    thinking: string;
  };
  room: {
    blackSeat: string;
    allowUndo: string;
    availableRooms: string;
    chatPlaceholder: string;
    connected: string;
    connection: string;
    copied: string;
    copyInvite: string;
    createOrJoin: string;
    createRoom: string;
    disconnected: string;
    joinRoom: string;
    leaveRoom: string;
    loadingRooms: string;
    lobbyPlaying: string;
    lobbyWaiting: string;
    noRooms: string;
    noMessages: string;
    notInRoom: string;
    notReady: string;
    opponentTurn: string;
    panelLabel: string;
    playerName: string;
    playerNamePlaceholder: string;
    playersCount: string;
    ready: string;
    readyAction: string;
    readyToStart: string;
    refreshRooms: string;
    resign: string;
    restartRoom: string;
    roomChat: string;
    roomClosed: string;
    roomCode: string;
    roomCodePlaceholder: string;
    selfStatus: string;
    sendMessage: string;
    spectatorSeat: string;
    spectatorStatus: string;
    spectators: string;
    startGame: string;
    unready: string;
    undoRequestCopy: string;
    undoRequestTitle: string;
    undoRequestsRemaining: string;
    rejectUndo: string;
    waitingForOpponent: string;
    waitingForReady: string;
    watchRoom: string;
    whiteSeat: string;
    you: string;
    yourSeat: string;
    yourTurn: string;
    youLose: string;
    youWin: string;
  };
  board: {
    label: string;
    point: string;
  };
  status: {
    panelLabel: string;
    title: string;
    blackTurn: string;
    whiteTurn: string;
    blackWins: string;
    whiteWins: string;
    draw: string;
    moves: string;
    blackStone: string;
    whiteStone: string;
  };
  ads: {
    placeholder: string;
    label: string;
  };
};

export type Dictionary = {
  localeName: string;
  game: GameDictionary;
};

const en = {
  localeName: "English",
  game: {
    appName: "Gomoku Online",
    heroTitle: "Play Gomoku Online",
    controls: {
      reset: "New game",
      undo: "Undo",
      language: "Language",
      theme: "Theme",
      lightTheme: "Switch to light mode",
      darkTheme: "Switch to dark mode"
    },
    modes: {
      label: "Game modes",
      local: "Local two-player",
      ai: "AI",
      room: "Friend room"
    },
    ai: {
      difficultyLabel: "AI difficulty",
      normal: "Normal",
      hard: "Hard",
      expert: "Expert",
      insane: "Insane",
      firstPlayerLabel: "First move",
      humanFirst: "You first",
      aiFirst: "AI first",
      playerBlackAiWhite: "You play black. AI plays white.",
      playerWhiteAiBlack: "You play white. AI plays black.",
      thinking: "AI thinking"
    },
    room: {
      blackSeat: "Black",
      allowUndo: "Allow",
      availableRooms: "Rooms",
      chatPlaceholder: "Message this room",
      connected: "Connected",
      connection: "Connection",
      copied: "Copied",
      copyInvite: "Copy invite",
      createOrJoin: "Create a room or enter a code.",
      createRoom: "Create room",
      disconnected: "Disconnected",
      joinRoom: "Join room",
      leaveRoom: "Leave",
      loadingRooms: "Loading rooms",
      lobbyPlaying: "Playing",
      lobbyWaiting: "Waiting",
      noRooms: "No rooms open",
      noMessages: "No messages yet",
      notInRoom: "No room joined",
      notReady: "Not ready",
      opponentTurn: "Opponent to move",
      panelLabel: "Friend room",
      playerName: "Name",
      playerNamePlaceholder: "Player 1234",
      playersCount: "Players {count}/2",
      ready: "Ready",
      readyAction: "Ready",
      readyToStart: "Both players ready",
      refreshRooms: "Refresh rooms",
      resign: "Resign",
      restartRoom: "Restart",
      roomChat: "Room chat",
      roomClosed: "Room closed",
      roomCode: "Room code",
      roomCodePlaceholder: "Random code",
      selfStatus: "{name} is in the room.",
      sendMessage: "Send",
      spectatorSeat: "Spectator",
      spectatorStatus: "{name} is watching.",
      spectators: "Spectators",
      startGame: "Start",
      unready: "Unready",
      undoRequestCopy: "{name} asks to undo the last move.",
      undoRequestTitle: "Undo request",
      undoRequestsRemaining: "Undo requests: {count}",
      rejectUndo: "Reject ({seconds})",
      waitingForOpponent: "Waiting for opponent",
      waitingForReady: "Waiting for ready",
      watchRoom: "Watch",
      whiteSeat: "White",
      you: "(you)",
      yourSeat: "Your seat",
      yourTurn: "Your move",
      youLose: "You lose",
      youWin: "You win"
    },
    board: {
      label: "15 by 15 Gomoku board",
      point: "Row {row}, column {col}"
    },
    status: {
      panelLabel: "Game status",
      title: "Current game",
      blackTurn: "Black to move",
      whiteTurn: "White to move",
      blackWins: "Black wins",
      whiteWins: "White wins",
      draw: "The board is full. Draw.",
      moves: "Moves played",
      blackStone: "Black stone",
      whiteStone: "White stone"
    },
    ads: {
      placeholder: "Ad placement",
      label: "Future ad placement"
    }
  }
} satisfies Dictionary;

const zh = {
  localeName: "中文",
  game: {
    appName: "五子棋在线",
    heroTitle: "在线对弈五子棋",
    controls: {
      reset: "新开一局",
      undo: "悔棋",
      language: "语言",
      theme: "主题",
      lightTheme: "切换到浅色模式",
      darkTheme: "切换到黑暗模式"
    },
    modes: {
      label: "游戏模式",
      local: "本地双人",
      ai: "人机",
      room: "好友房"
    },
    ai: {
      difficultyLabel: "AI 难度",
      normal: "普通",
      hard: "困难",
      expert: "专家",
      insane: "疯狂",
      firstPlayerLabel: "先手选择",
      humanFirst: "玩家先手",
      aiFirst: "AI 先手",
      playerBlackAiWhite: "你执黑，AI 执白。",
      playerWhiteAiBlack: "你执白，AI 执黑。",
      thinking: "AI 思考中"
    },
    room: {
      blackSeat: "黑棋",
      allowUndo: "允许",
      availableRooms: "房间列表",
      chatPlaceholder: "发送房间消息",
      connected: "已连接",
      connection: "连接",
      copied: "已复制",
      copyInvite: "复制邀请",
      createOrJoin: "创建房间或输入房间码。",
      createRoom: "创建房间",
      disconnected: "已断开",
      joinRoom: "加入房间",
      leaveRoom: "离开",
      loadingRooms: "正在加载房间",
      lobbyPlaying: "对局中",
      lobbyWaiting: "等待中",
      noRooms: "暂无房间",
      noMessages: "暂无消息",
      notInRoom: "尚未加入房间",
      notReady: "未准备",
      opponentTurn: "对手回合",
      panelLabel: "好友房",
      playerName: "昵称",
      playerNamePlaceholder: "Player 1234",
      playersCount: "玩家 {count}/2",
      ready: "已准备",
      readyAction: "准备",
      readyToStart: "双方已准备",
      refreshRooms: "刷新房间",
      resign: "认输",
      restartRoom: "重开",
      roomChat: "房间聊天",
      roomClosed: "房间已关闭",
      roomCode: "房间码",
      roomCodePlaceholder: "随机房间码",
      selfStatus: "{name} 已在房间中。",
      sendMessage: "发送",
      spectatorSeat: "观战席",
      spectatorStatus: "{name} 正在观战。",
      spectators: "观战者",
      startGame: "开始",
      unready: "取消准备",
      undoRequestCopy: "{name} 请求悔回上一手。",
      undoRequestTitle: "悔棋请求",
      undoRequestsRemaining: "悔棋请求：{count}",
      rejectUndo: "拒绝（{seconds}）",
      waitingForOpponent: "等待对手加入",
      waitingForReady: "等待准备",
      watchRoom: "观战",
      whiteSeat: "白棋",
      you: "（你）",
      yourSeat: "你的座位",
      yourTurn: "轮到你落子",
      youLose: "你输了",
      youWin: "你赢了"
    },
    board: {
      label: "15 乘 15 五子棋棋盘",
      point: "第 {row} 行，第 {col} 列"
    },
    status: {
      panelLabel: "对局状态",
      title: "当前对局",
      blackTurn: "黑棋回合",
      whiteTurn: "白棋回合",
      blackWins: "黑棋获胜",
      whiteWins: "白棋获胜",
      draw: "棋盘已满，平局",
      moves: "已落子",
      blackStone: "黑棋",
      whiteStone: "白棋"
    },
    ads: {
      placeholder: "广告预留位",
      label: "未来广告位"
    }
  }
} satisfies Dictionary;

const fr = {
  localeName: "Français",
  game: {
    appName: "Gomoku en ligne",
    heroTitle: "Jouer au Gomoku en ligne",
    controls: {
      reset: "Nouvelle partie",
      undo: "Annuler",
      language: "Langue",
      theme: "Thème",
      lightTheme: "Passer au mode clair",
      darkTheme: "Passer au mode sombre"
    },
    modes: {
      label: "Modes de jeu",
      local: "Deux joueurs locaux",
      ai: "IA",
      room: "Salon ami"
    },
    ai: {
      difficultyLabel: "Difficulté de l'IA",
      normal: "Normal",
      hard: "Difficile",
      expert: "Expert",
      insane: "Insane",
      firstPlayerLabel: "Premier coup",
      humanFirst: "Vous d'abord",
      aiFirst: "IA d'abord",
      playerBlackAiWhite: "Vous jouez les noirs. L'IA joue les blancs.",
      playerWhiteAiBlack: "Vous jouez les blancs. L'IA joue les noirs.",
      thinking: "L'IA réfléchit"
    },
    room: {
      blackSeat: "Noirs",
      allowUndo: "Autoriser",
      availableRooms: "Salons",
      chatPlaceholder: "Message du salon",
      connected: "Connecté",
      connection: "Connexion",
      copied: "Copié",
      copyInvite: "Copier l'invitation",
      createOrJoin: "Créez un salon ou entrez un code.",
      createRoom: "Créer un salon",
      disconnected: "Déconnecté",
      joinRoom: "Rejoindre",
      leaveRoom: "Quitter",
      loadingRooms: "Chargement des salons",
      lobbyPlaying: "En jeu",
      lobbyWaiting: "En attente",
      noRooms: "Aucun salon ouvert",
      noMessages: "Aucun message",
      notInRoom: "Aucun salon rejoint",
      notReady: "Pas prêt",
      opponentTurn: "À l'adversaire",
      panelLabel: "Salon ami",
      playerName: "Nom",
      playerNamePlaceholder: "Player 1234",
      playersCount: "Joueurs {count}/2",
      ready: "Prêt",
      readyAction: "Prêt",
      readyToStart: "Deux joueurs prêts",
      refreshRooms: "Actualiser les salons",
      resign: "Abandonner",
      restartRoom: "Recommencer",
      roomChat: "Chat du salon",
      roomClosed: "Salon fermé",
      roomCode: "Code du salon",
      roomCodePlaceholder: "Code aléatoire",
      selfStatus: "{name} est dans le salon.",
      sendMessage: "Envoyer",
      spectatorSeat: "Spectateur",
      spectatorStatus: "{name} regarde la partie.",
      spectators: "Spectateurs",
      startGame: "Démarrer",
      unready: "Annuler prêt",
      undoRequestCopy: "{name} demande d'annuler le dernier coup.",
      undoRequestTitle: "Demande d'annulation",
      undoRequestsRemaining: "Demandes restantes : {count}",
      rejectUndo: "Refuser ({seconds})",
      waitingForOpponent: "En attente d'un adversaire",
      waitingForReady: "En attente des joueurs",
      watchRoom: "Regarder",
      whiteSeat: "Blancs",
      you: "(vous)",
      yourSeat: "Votre couleur",
      yourTurn: "À vous de jouer",
      youLose: "Vous perdez",
      youWin: "Vous gagnez"
    },
    board: {
      label: "Plateau de Gomoku 15 par 15",
      point: "Ligne {row}, colonne {col}"
    },
    status: {
      panelLabel: "État de la partie",
      title: "Partie en cours",
      blackTurn: "Aux noirs de jouer",
      whiteTurn: "Aux blancs de jouer",
      blackWins: "Les noirs gagnent",
      whiteWins: "Les blancs gagnent",
      draw: "Le plateau est plein. Match nul.",
      moves: "Coups joués",
      blackStone: "Pierre noire",
      whiteStone: "Pierre blanche"
    },
    ads: {
      placeholder: "Emplacement publicitaire",
      label: "Futur emplacement publicitaire"
    }
  }
} satisfies Dictionary;

const es = {
  localeName: "Español",
  game: {
    appName: "Gomoku en línea",
    heroTitle: "Juega Gomoku en línea",
    controls: {
      reset: "Nueva partida",
      undo: "Deshacer",
      language: "Idioma",
      theme: "Tema",
      lightTheme: "Cambiar al modo claro",
      darkTheme: "Cambiar al modo oscuro"
    },
    modes: {
      label: "Modos de juego",
      local: "Dos jugadores locales",
      ai: "IA",
      room: "Sala de amigos"
    },
    ai: {
      difficultyLabel: "Dificultad de IA",
      normal: "Normal",
      hard: "Difícil",
      expert: "Experto",
      insane: "Insane",
      firstPlayerLabel: "Primer movimiento",
      humanFirst: "Tú primero",
      aiFirst: "IA primero",
      playerBlackAiWhite: "Juegas con negras. La IA juega con blancas.",
      playerWhiteAiBlack: "Juegas con blancas. La IA juega con negras.",
      thinking: "La IA piensa"
    },
    room: {
      blackSeat: "Negras",
      allowUndo: "Permitir",
      availableRooms: "Salas",
      chatPlaceholder: "Mensaje de sala",
      connected: "Conectado",
      connection: "Conexión",
      copied: "Copiado",
      copyInvite: "Copiar invitación",
      createOrJoin: "Crea una sala o introduce un código.",
      createRoom: "Crear sala",
      disconnected: "Desconectado",
      joinRoom: "Unirse",
      leaveRoom: "Salir",
      loadingRooms: "Cargando salas",
      lobbyPlaying: "En juego",
      lobbyWaiting: "Esperando",
      noRooms: "No hay salas",
      noMessages: "Sin mensajes",
      notInRoom: "Sin sala",
      notReady: "No listo",
      opponentTurn: "Turno del rival",
      panelLabel: "Sala de amigos",
      playerName: "Nombre",
      playerNamePlaceholder: "Player 1234",
      playersCount: "Jugadores {count}/2",
      ready: "Listo",
      readyAction: "Listo",
      readyToStart: "Ambos listos",
      refreshRooms: "Actualizar salas",
      resign: "Rendirse",
      restartRoom: "Reiniciar",
      roomChat: "Chat de sala",
      roomClosed: "Sala cerrada",
      roomCode: "Código",
      roomCodePlaceholder: "Código aleatorio",
      selfStatus: "{name} está en la sala.",
      sendMessage: "Enviar",
      spectatorSeat: "Espectador",
      spectatorStatus: "{name} está mirando.",
      spectators: "Espectadores",
      startGame: "Empezar",
      unready: "No listo",
      undoRequestCopy: "{name} pide deshacer el último movimiento.",
      undoRequestTitle: "Solicitud de deshacer",
      undoRequestsRemaining: "Solicitudes restantes: {count}",
      rejectUndo: "Rechazar ({seconds})",
      waitingForOpponent: "Esperando rival",
      waitingForReady: "Esperando listos",
      watchRoom: "Mirar",
      whiteSeat: "Blancas",
      you: "(tú)",
      yourSeat: "Tu color",
      yourTurn: "Tu turno",
      youLose: "Pierdes",
      youWin: "Ganas"
    },
    board: {
      label: "Tablero de Gomoku de 15 por 15",
      point: "Fila {row}, columna {col}"
    },
    status: {
      panelLabel: "Estado de la partida",
      title: "Partida actual",
      blackTurn: "Turno de negras",
      whiteTurn: "Turno de blancas",
      blackWins: "Ganan las negras",
      whiteWins: "Ganan las blancas",
      draw: "El tablero está lleno. Empate.",
      moves: "Movimientos jugados",
      blackStone: "Piedra negra",
      whiteStone: "Piedra blanca"
    },
    ads: {
      placeholder: "Espacio para anuncio",
      label: "Futuro espacio publicitario"
    }
  }
} satisfies Dictionary;

const ru = {
  localeName: "Русский",
  game: {
    appName: "Гомоку онлайн",
    heroTitle: "Играйте в гомоку онлайн",
    controls: {
      reset: "Новая игра",
      undo: "Отменить",
      language: "Язык",
      theme: "Тема",
      lightTheme: "Включить светлую тему",
      darkTheme: "Включить темную тему"
    },
    modes: {
      label: "Режимы игры",
      local: "Два игрока",
      ai: "ИИ",
      room: "Комната друга"
    },
    ai: {
      difficultyLabel: "Сложность ИИ",
      normal: "Обычно",
      hard: "Сложно",
      expert: "Эксперт",
      insane: "Insane",
      firstPlayerLabel: "Первый ход",
      humanFirst: "Вы первые",
      aiFirst: "ИИ первый",
      playerBlackAiWhite: "Вы играете черными. ИИ играет белыми.",
      playerWhiteAiBlack: "Вы играете белыми. ИИ играет черными.",
      thinking: "ИИ думает"
    },
    room: {
      blackSeat: "Черные",
      allowUndo: "Разрешить",
      availableRooms: "Комнаты",
      chatPlaceholder: "Сообщение в комнату",
      connected: "Подключен",
      connection: "Связь",
      copied: "Скопировано",
      copyInvite: "Копировать ссылку",
      createOrJoin: "Создайте комнату или введите код.",
      createRoom: "Создать комнату",
      disconnected: "Отключен",
      joinRoom: "Войти",
      leaveRoom: "Выйти",
      loadingRooms: "Загрузка комнат",
      lobbyPlaying: "Идет игра",
      lobbyWaiting: "Ожидание",
      noRooms: "Нет открытых комнат",
      noMessages: "Сообщений пока нет",
      notInRoom: "Комната не выбрана",
      notReady: "Не готов",
      opponentTurn: "Ход соперника",
      panelLabel: "Комната друга",
      playerName: "Имя",
      playerNamePlaceholder: "Player 1234",
      playersCount: "Игроки {count}/2",
      ready: "Готов",
      readyAction: "Готов",
      readyToStart: "Оба готовы",
      refreshRooms: "Обновить комнаты",
      resign: "Сдаться",
      restartRoom: "Заново",
      roomChat: "Чат комнаты",
      roomClosed: "Комната закрыта",
      roomCode: "Код комнаты",
      roomCodePlaceholder: "Случайный код",
      selfStatus: "{name} в комнате.",
      sendMessage: "Отправить",
      spectatorSeat: "Зритель",
      spectatorStatus: "{name} наблюдает за игрой.",
      spectators: "Зрители",
      startGame: "Старт",
      unready: "Не готов",
      undoRequestCopy: "{name} просит отменить последний ход.",
      undoRequestTitle: "Запрос отмены",
      undoRequestsRemaining: "Запросов осталось: {count}",
      rejectUndo: "Отклонить ({seconds})",
      waitingForOpponent: "Ожидание соперника",
      waitingForReady: "Ожидание готовности",
      watchRoom: "Смотреть",
      whiteSeat: "Белые",
      you: "(вы)",
      yourSeat: "Ваш цвет",
      yourTurn: "Ваш ход",
      youLose: "Вы проиграли",
      youWin: "Вы выиграли"
    },
    board: {
      label: "Доска гомоку 15 на 15",
      point: "Строка {row}, столбец {col}"
    },
    status: {
      panelLabel: "Статус игры",
      title: "Текущая партия",
      blackTurn: "Ход черных",
      whiteTurn: "Ход белых",
      blackWins: "Черные победили",
      whiteWins: "Белые победили",
      draw: "Доска заполнена. Ничья.",
      moves: "Сделано ходов",
      blackStone: "Черный камень",
      whiteStone: "Белый камень"
    },
    ads: {
      placeholder: "Место для рекламы",
      label: "Будущее место для рекламы"
    }
  }
} satisfies Dictionary;

const ar = {
  localeName: "العربية",
  game: {
    appName: "غوموكو على الإنترنت",
    heroTitle: "العب غوموكو على الإنترنت",
    controls: {
      reset: "لعبة جديدة",
      undo: "تراجع",
      language: "اللغة",
      theme: "السمة",
      lightTheme: "التبديل إلى الوضع الفاتح",
      darkTheme: "التبديل إلى الوضع الداكن"
    },
    modes: {
      label: "أوضاع اللعب",
      local: "لاعبان محليان",
      ai: "الذكاء الاصطناعي",
      room: "غرفة صديق"
    },
    ai: {
      difficultyLabel: "صعوبة الذكاء الاصطناعي",
      normal: "عادي",
      hard: "صعب",
      expert: "خبير",
      insane: "Insane",
      firstPlayerLabel: "النقلة الأولى",
      humanFirst: "أنت أولا",
      aiFirst: "الذكاء أولا",
      playerBlackAiWhite: "أنت تلعب بالأسود. الذكاء الاصطناعي يلعب بالأبيض.",
      playerWhiteAiBlack: "أنت تلعب بالأبيض. الذكاء الاصطناعي يلعب بالأسود.",
      thinking: "الذكاء الاصطناعي يفكر"
    },
    room: {
      blackSeat: "الأسود",
      allowUndo: "السماح",
      availableRooms: "الغرف",
      chatPlaceholder: "رسالة الغرفة",
      connected: "متصل",
      connection: "الاتصال",
      copied: "تم النسخ",
      copyInvite: "نسخ الدعوة",
      createOrJoin: "أنشئ غرفة أو أدخل رمزا.",
      createRoom: "إنشاء غرفة",
      disconnected: "غير متصل",
      joinRoom: "انضمام",
      leaveRoom: "مغادرة",
      loadingRooms: "جار تحميل الغرف",
      lobbyPlaying: "قيد اللعب",
      lobbyWaiting: "انتظار",
      noRooms: "لا توجد غرف مفتوحة",
      noMessages: "لا توجد رسائل بعد",
      notInRoom: "لا توجد غرفة",
      notReady: "غير جاهز",
      opponentTurn: "دور الخصم",
      panelLabel: "غرفة صديق",
      playerName: "الاسم",
      playerNamePlaceholder: "Player 1234",
      playersCount: "اللاعبون {count}/2",
      ready: "جاهز",
      readyAction: "جاهز",
      readyToStart: "اللاعبان جاهزان",
      refreshRooms: "تحديث الغرف",
      resign: "استسلام",
      restartRoom: "إعادة",
      roomChat: "دردشة الغرفة",
      roomClosed: "الغرفة مغلقة",
      roomCode: "رمز الغرفة",
      roomCodePlaceholder: "رمز عشوائي",
      selfStatus: "{name} داخل الغرفة.",
      sendMessage: "إرسال",
      spectatorSeat: "مشاهد",
      spectatorStatus: "{name} يشاهد المباراة.",
      spectators: "المشاهدون",
      startGame: "بدء",
      unready: "إلغاء الجاهزية",
      undoRequestCopy: "{name} يطلب التراجع عن النقلة الأخيرة.",
      undoRequestTitle: "طلب تراجع",
      undoRequestsRemaining: "طلبات التراجع: {count}",
      rejectUndo: "رفض ({seconds})",
      waitingForOpponent: "بانتظار الخصم",
      waitingForReady: "بانتظار الجاهزية",
      watchRoom: "مشاهدة",
      whiteSeat: "الأبيض",
      you: "(أنت)",
      yourSeat: "لونك",
      yourTurn: "دورك",
      youLose: "خسرت",
      youWin: "فزت"
    },
    board: {
      label: "لوحة غوموكو 15 في 15",
      point: "الصف {row}، العمود {col}"
    },
    status: {
      panelLabel: "حالة اللعبة",
      title: "اللعبة الحالية",
      blackTurn: "دور الأسود",
      whiteTurn: "دور الأبيض",
      blackWins: "فاز الأسود",
      whiteWins: "فاز الأبيض",
      draw: "امتلأت اللوحة. تعادل.",
      moves: "النقلات الملعوبة",
      blackStone: "حجر أسود",
      whiteStone: "حجر أبيض"
    },
    ads: {
      placeholder: "مساحة إعلانية",
      label: "مساحة إعلان مستقبلية"
    }
  }
} satisfies Dictionary;

export const dictionaries = {
  en,
  zh,
  fr,
  es,
  ru,
  ar
} satisfies Record<Locale, Dictionary>;

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale] ?? dictionaries.en;
}
