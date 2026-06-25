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
