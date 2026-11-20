import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Check, ChevronDown, Globe, LogIn, UserPlus } from "lucide-react";

import BrandMark from "../components/BrandMark";
import Button from "../components/Button";
import InputField from "../components/InputField";
import Loading from "../components/Loading";
import { useApplyPrefs } from "../hooks/useApplyPrefs";
import { useAuthStore } from "../stores/authStore";
import { useLocale, type Locale } from "../stores/locale";
import { safeReturnTo } from "../utils/redirect";

const USERNAME_RE = /^[A-Za-z0-9_\-\u4e00-\u9fff]{3,32}$/;

type Tab = "login" | "register";

interface FieldErrors {
  username?: string;
  nickname?: string;
  password?: string;
  confirm?: string;
}

interface PortalText {
  brand: string;
  brandSub: string;
  tabLogin: string;
  tabRegister: string;
  headingLogin: string;
  headingRegister: string;
  subtitle: string;
  username: string;
  usernamePlaceholder: string;
  usernameHint: string;
  nickname: string;
  nicknamePlaceholder: string;
  nicknameHint: string;
  password: string;
  passwordPlaceholder: string;
  confirm: string;
  confirmPlaceholder: string;
  submitLogin: string;
  submitRegister: string;
  busyLogin: string;
  busyRegister: string;
  agreePrefix: string;
  agreeAnd: string;
  agreeSuffix: string;
  termsName: string;
  privacyName: string;
  guestHint: string;
  guestAction: string;
  passwordChanged: string;
  errUsernameRequired: string;
  errUsernameFormat: string;
  errPasswordRequired: string;
  errPasswordLength: string;
  errConfirmMismatch: string;
  errNicknameLength: string;
  errGeneric: string;
  privacy: string;
  terms: string;
  copyrightLink: string;
  languageSetting: string;
  copyright: string;
  loading: string;
}

/** 登录门户页文案：与微信网页版一致，语言切换只影响登录页与页脚 */
const TEXT: Record<Locale, PortalText> = {
  "zh-Hans": {
    brand: "修必达 FixIt AI",
    brandSub: "AI 家电维修助手",
    tabLogin: "登录",
    tabRegister: "注册",
    headingLogin: "登录账号",
    headingRegister: "创建账号",
    subtitle: "登录后可保存你的设备与维修记录，并在不同设备间同步。",
    username: "用户名",
    usernamePlaceholder: "3-32 位字母、数字、下划线或中文",
    usernameHint: "账号唯一标识，登录时使用；昵称可随后修改。",
    nickname: "昵称",
    nicknamePlaceholder: "选填，默认使用用户名",
    nicknameHint: "展示用昵称，修改后刷新仍会保留。",
    password: "密码",
    passwordPlaceholder: "至少 8 位",
    confirm: "确认密码",
    confirmPlaceholder: "请再次输入密码",
    submitLogin: "登录",
    submitRegister: "注册并登录",
    busyLogin: "登录中…",
    busyRegister: "注册中…",
    agreePrefix: "点击「注册并登录」即表示你已阅读并同意",
    agreeAnd: "与",
    agreeSuffix: "。",
    termsName: "《用户协议》",
    privacyName: "《隐私政策》",
    guestHint: "不登录也可以进行故障诊断和查看演示设备，游客数据只保存在本机。",
    guestAction: "先体验一下",
    passwordChanged: "密码已修改，旧登录状态已失效，请使用新密码重新登录。",
    errUsernameRequired: "请输入用户名",
    errUsernameFormat: "用户名需为 3-32 位字母、数字、下划线、连字符或中文",
    errPasswordRequired: "请输入密码",
    errPasswordLength: "密码至少 8 位",
    errConfirmMismatch: "两次输入的密码不一致",
    errNicknameLength: "昵称最多 32 个字符",
    errGeneric: "操作失败，请稍后重试",
    privacy: "隐私保护指引",
    terms: "软件许可及服务协议",
    copyrightLink: "版权声明",
    languageSetting: "语言设置",
    copyright: "Copyright © 2026 修必达 FixIt AI · ZengYingyi · ChenLin. All Rights Reserved.",
    loading: "正在恢复登录状态…",
  },
  "zh-Hant": {
    brand: "修必達 FixIt AI",
    brandSub: "AI 家電維修助手",
    tabLogin: "登入",
    tabRegister: "註冊",
    headingLogin: "登入帳號",
    headingRegister: "建立新帳號",
    subtitle: "登入後可儲存你的裝置與維修紀錄，並在不同裝置間同步。",
    username: "使用者名稱",
    usernamePlaceholder: "3-32 位字母、數字、底線或中文",
    usernameHint: "帳號唯一標識，登入時使用；暱稱可稍後修改。",
    nickname: "暱稱",
    nicknamePlaceholder: "選填，預設使用使用者名稱",
    nicknameHint: "展示用暱稱，修改後重新整理仍會保留。",
    password: "密碼",
    passwordPlaceholder: "至少 8 位",
    confirm: "確認密碼",
    confirmPlaceholder: "請再次輸入密碼",
    submitLogin: "登入",
    submitRegister: "註冊並登入",
    busyLogin: "登入中…",
    busyRegister: "註冊中…",
    agreePrefix: "點擊「註冊並登入」即表示你已閱讀並同意",
    agreeAnd: "與",
    agreeSuffix: "。",
    termsName: "《使用者協議》",
    privacyName: "《隱私政策》",
    guestHint: "不登入也可以進行故障診斷與查看示範裝置，訪客資料只保存在本機。",
    guestAction: "先體驗一下",
    passwordChanged: "密碼已修改，舊的登入狀態已失效，請使用新密碼重新登入。",
    errUsernameRequired: "請輸入使用者名稱",
    errUsernameFormat: "使用者名稱需為 3-32 位字母、數字、底線、連字號或中文",
    errPasswordRequired: "請輸入密碼",
    errPasswordLength: "密碼至少 8 位",
    errConfirmMismatch: "兩次輸入的密碼不一致",
    errNicknameLength: "暱稱最多 32 個字元",
    errGeneric: "操作失敗，請稍後重試",
    privacy: "隱私保護指引",
    terms: "軟體許可及服務協議",
    copyrightLink: "版權聲明",
    languageSetting: "語言設定",
    copyright: "Copyright © 2026 修必達 FixIt AI · ZengYingyi · ChenLin. All Rights Reserved.",
    loading: "正在還原登入狀態…",
  },
  en: {
    brand: "FixIt AI",
    brandSub: "AI home appliance repair assistant",
    tabLogin: "Sign in",
    tabRegister: "Sign up",
    headingLogin: "Sign in to your account",
    headingRegister: "Create your account",
    subtitle: "Sign in to save your devices and repair records, and sync them across devices.",
    username: "Username",
    usernamePlaceholder: "3–32 letters, digits, underscores or Chinese characters",
    usernameHint: "Your unique account ID used for signing in; the nickname can be changed later.",
    nickname: "Nickname",
    nicknamePlaceholder: "Optional, defaults to your username",
    nicknameHint: "Display name; it is kept after a page refresh.",
    password: "Password",
    passwordPlaceholder: "At least 8 characters",
    confirm: "Confirm password",
    confirmPlaceholder: "Enter the password again",
    submitLogin: "Sign in",
    submitRegister: "Sign up and sign in",
    busyLogin: "Signing in…",
    busyRegister: "Signing up…",
    agreePrefix: "By clicking “Sign up and sign in”, you agree to the",
    agreeAnd: "and the",
    agreeSuffix: ".",
    termsName: "“User Agreement”",
    privacyName: "“Privacy Policy”",
    guestHint: "You can also run diagnostics and view demo devices without signing in; guest data stays on this device only.",
    guestAction: "Continue as guest",
    passwordChanged: "Your password was changed and previous sessions were revoked. Please sign in again.",
    errUsernameRequired: "Please enter a username",
    errUsernameFormat: "Username must be 3–32 letters, digits, underscores, hyphens or Chinese characters",
    errPasswordRequired: "Please enter a password",
    errPasswordLength: "Password must be at least 8 characters",
    errConfirmMismatch: "The two passwords do not match",
    errNicknameLength: "Nickname must be at most 32 characters",
    errGeneric: "Something went wrong, please try again later",
    privacy: "Privacy Policy",
    terms: "Software License & Terms of Service",
    copyrightLink: "Copyright Notice",
    languageSetting: "Language",
    copyright: "Copyright © 2026 FixIt AI · ZengYingyi · ChenLin. All Rights Reserved.",
    loading: "Restoring your session…",
  },
  ja: {
    brand: "修必達 FixIt AI",
    brandSub: "AI家電修理アシスタント",
    tabLogin: "ログイン",
    tabRegister: "新規登録",
    headingLogin: "アカウントにログイン",
    headingRegister: "アカウントを作成",
    subtitle: "ログインすると、家電と修理記録を保存し、端末間で同期できます。",
    username: "ユーザー名",
    usernamePlaceholder: "3〜32文字の英数字、アンダースコアまたは漢字",
    usernameHint: "ログインに使う一意のアカウントID。ニックネームは後で変更できます。",
    nickname: "ニックネーム",
    nicknamePlaceholder: "任意。未入力の場合はユーザー名を使用",
    nicknameHint: "表示用の名前。変更後も保持されます。",
    password: "パスワード",
    passwordPlaceholder: "8文字以上",
    confirm: "パスワード（確認）",
    confirmPlaceholder: "もう一度パスワードを入力",
    submitLogin: "ログイン",
    submitRegister: "登録してログイン",
    busyLogin: "ログイン中…",
    busyRegister: "登録中…",
    agreePrefix: "「登録してログイン」をクリックすると、",
    agreeAnd: "と",
    agreeSuffix: "に同意したものとみなされます。",
    termsName: "『利用規約』",
    privacyName: "『プライバシーポリシー』",
    guestHint: "ログインしなくても故障診断やデモ機器の閲覧が可能です。ゲストデータはこの端末にのみ保存されます。",
    guestAction: "まず体験する",
    passwordChanged: "パスワードが変更されました。以前のセッションは無効になりました。新しいパスワードでログインしてください。",
    errUsernameRequired: "ユーザー名を入力してください",
    errUsernameFormat: "ユーザー名は3〜32文字の英数字、アンダースコア、ハイフンまたは漢字で入力してください",
    errPasswordRequired: "パスワードを入力してください",
    errPasswordLength: "パスワードは8文字以上にしてください",
    errConfirmMismatch: "パスワードが一致しません",
    errNicknameLength: "ニックネームは32文字以内にしてください",
    errGeneric: "操作に失敗しました。しばらくしてからもう一度お試しください",
    privacy: "プライバシーポリシー",
    terms: "ソフトウェアライセンスおよびサービス規約",
    copyrightLink: "著作権表示",
    languageSetting: "言語設定",
    copyright: "Copyright © 2026 FixIt AI · ZengYingyi · ChenLin. All Rights Reserved.",
    loading: "ログイン状態を復元しています…",
  },
  ko: {
    brand: "FixIt AI",
    brandSub: "AI 가전제품 수리 도우미",
    tabLogin: "로그인",
    tabRegister: "회원가입",
    headingLogin: "계정 로그인",
    headingRegister: "계정 만들기",
    subtitle: "로그인하면 가전제품과 수리 기록이 저장되고 기기 간에 동기화됩니다.",
    username: "사용자 이름",
    usernamePlaceholder: "3~32자의 영문, 숫자, 밑줄 또는 한자",
    usernameHint: "로그인에 사용하는 고유 계정 ID입니다. 닉네임은 나중에 변경할 수 있습니다.",
    nickname: "닉네임",
    nicknamePlaceholder: "선택 사항. 기본값은 사용자 이름",
    nicknameHint: "표시용 이름이며 변경 후에도 유지됩니다.",
    password: "비밀번호",
    passwordPlaceholder: "8자 이상",
    confirm: "비밀번호 확인",
    confirmPlaceholder: "비밀번호를 다시 입력하세요",
    submitLogin: "로그인",
    submitRegister: "가입하고 로그인",
    busyLogin: "로그인 중…",
    busyRegister: "가입 중…",
    agreePrefix: "「가입하고 로그인」을 클릭하면",
    agreeAnd: "와",
    agreeSuffix: "에 동의한 것으로 간주됩니다.",
    termsName: "「사용자 약관」",
    privacyName: "「개인정보 처리방침」",
    guestHint: "로그인하지 않아도 고장 진단 및 데모 기기 조회가 가능합니다. 게스트 데이터는 이 기기에만 저장됩니다.",
    guestAction: "먼저 체험하기",
    passwordChanged: "비밀번호가 변경되어 이전 로그인 상태가 만료되었습니다. 새 비밀번호로 다시 로그인하세요.",
    errUsernameRequired: "사용자 이름을 입력하세요",
    errUsernameFormat: "사용자 이름은 3~32자의 영문, 숫자, 밑줄, 하이픈 또는 한자여야 합니다",
    errPasswordRequired: "비밀번호를 입력하세요",
    errPasswordLength: "비밀번호는 8자 이상이어야 합니다",
    errConfirmMismatch: "비밀번호가 일치하지 않습니다",
    errNicknameLength: "닉네임은 32자 이하여야 합니다",
    errGeneric: "작업에 실패했습니다. 잠시 후 다시 시도하세요",
    privacy: "개인정보 처리방침",
    terms: "소프트웨어 라이선스 및 서비스 약관",
    copyrightLink: "저작권 안내",
    languageSetting: "언어 설정",
    copyright: "Copyright © 2026 FixIt AI · ZengYingyi · ChenLin. All Rights Reserved.",
    loading: "로그인 상태를 복원하는 중…",
  },
  fr: {
    brand: "FixIt AI",
    brandSub: "Assistant IA de réparation d'électroménager",
    tabLogin: "Connexion",
    tabRegister: "Inscription",
    headingLogin: "Connexion à votre compte",
    headingRegister: "Créer votre compte",
    subtitle: "Connectez-vous pour enregistrer vos appareils et vos historiques de réparation, et les synchroniser entre vos appareils.",
    username: "Nom d'utilisateur",
    usernamePlaceholder: "3 à 32 caractères : lettres, chiffres, tirets bas ou caractères chinois",
    usernameHint: "Identifiant unique utilisé pour la connexion ; le pseudonyme peut être modifié ultérieurement.",
    nickname: "Pseudonyme",
    nicknamePlaceholder: "Facultatif, par défaut le nom d'utilisateur",
    nicknameHint: "Nom affiché ; il est conservé après actualisation.",
    password: "Mot de passe",
    passwordPlaceholder: "Au moins 8 caractères",
    confirm: "Confirmer le mot de passe",
    confirmPlaceholder: "Saisir à nouveau le mot de passe",
    submitLogin: "Se connecter",
    submitRegister: "S'inscrire et se connecter",
    busyLogin: "Connexion…",
    busyRegister: "Inscription…",
    agreePrefix: "En cliquant sur « S'inscrire et se connecter », vous acceptez",
    agreeAnd: "et",
    agreeSuffix: ".",
    termsName: "« Conditions d'utilisation »",
    privacyName: "« Politique de confidentialité »",
    guestHint: "Vous pouvez aussi lancer un diagnostic et consulter les appareils de démonstration sans vous connecter ; les données invités restent sur cet appareil.",
    guestAction: "Essayer sans compte",
    passwordChanged: "Votre mot de passe a été modifié et les sessions précédentes ont été révoquées. Veuillez vous reconnecter.",
    errUsernameRequired: "Veuillez saisir un nom d'utilisateur",
    errUsernameFormat: "Le nom d'utilisateur doit contenir 3 à 32 caractères : lettres, chiffres, tirets bas, tirets ou caractères chinois",
    errPasswordRequired: "Veuillez saisir un mot de passe",
    errPasswordLength: "Le mot de passe doit contenir au moins 8 caractères",
    errConfirmMismatch: "Les deux mots de passe ne correspondent pas",
    errNicknameLength: "Le pseudonyme doit contenir au plus 32 caractères",
    errGeneric: "Une erreur est survenue, veuillez réessayer plus tard",
    privacy: "Politique de confidentialité",
    terms: "Licence logicielle et conditions de service",
    copyrightLink: "Mention de droits d'auteur",
    languageSetting: "Langue",
    copyright: "Copyright © 2026 FixIt AI · ZengYingyi · ChenLin. All Rights Reserved.",
    loading: "Restauration de votre session…",
  },
  de: {
    brand: "FixIt AI",
    brandSub: "KI-Assistent für Haushaltsgeräte-Reparaturen",
    tabLogin: "Anmelden",
    tabRegister: "Registrieren",
    headingLogin: "Bei Ihrem Konto anmelden",
    headingRegister: "Konto erstellen",
    subtitle: "Melden Sie sich an, um Ihre Geräte und Reparaturverläufe zu speichern und zwischen Ihren Geräten zu synchronisieren.",
    username: "Benutzername",
    usernamePlaceholder: "3–32 Zeichen: Buchstaben, Ziffern, Unterstriche oder chinesische Zeichen",
    usernameHint: "Eindeutige Konto-ID für die Anmeldung; der Spitzname kann später geändert werden.",
    nickname: "Spitzname",
    nicknamePlaceholder: "Optional, standardmäßig der Benutzername",
    nicknameHint: "Anzeigename; er bleibt nach dem Aktualisieren erhalten.",
    password: "Passwort",
    passwordPlaceholder: "Mindestens 8 Zeichen",
    confirm: "Passwort bestätigen",
    confirmPlaceholder: "Passwort erneut eingeben",
    submitLogin: "Anmelden",
    submitRegister: "Registrieren und anmelden",
    busyLogin: "Anmeldung…",
    busyRegister: "Registrierung…",
    agreePrefix: "Mit dem Klick auf „Registrieren und anmelden“ stimmen Sie",
    agreeAnd: "und",
    agreeSuffix: "zu.",
    termsName: "„Nutzungsbedingungen“",
    privacyName: "„Datenschutzerklärung“",
    guestHint: "Sie können auch ohne Anmeldung Diagnosen durchführen und Demo-Geräte ansehen; Gastdaten bleiben nur auf diesem Gerät.",
    guestAction: "Erst einmal ausprobieren",
    passwordChanged: "Ihr Passwort wurde geändert und frühere Sitzungen wurden widerrufen. Bitte melden Sie sich erneut an.",
    errUsernameRequired: "Bitte geben Sie einen Benutzernamen ein",
    errUsernameFormat: "Der Benutzername muss 3–32 Zeichen enthalten: Buchstaben, Ziffern, Unterstriche, Bindestriche oder chinesische Zeichen",
    errPasswordRequired: "Bitte geben Sie ein Passwort ein",
    errPasswordLength: "Das Passwort muss mindestens 8 Zeichen lang sein",
    errConfirmMismatch: "Die beiden Passwörter stimmen nicht überein",
    errNicknameLength: "Der Spitzname darf höchstens 32 Zeichen enthalten",
    errGeneric: "Etwas ist schiefgelaufen. Bitte versuchen Sie es später erneut",
    privacy: "Datenschutzerklärung",
    terms: "Softwarelizenz und Nutzungsbedingungen",
    copyrightLink: "Urheberrechtshinweis",
    languageSetting: "Sprache",
    copyright: "Copyright © 2026 FixIt AI · ZengYingyi · ChenLin. All Rights Reserved.",
    loading: "Sitzung wird wiederhergestellt…",
  },
  es: {
    brand: "FixIt AI",
    brandSub: "Asistente de IA para reparar electrodomésticos",
    tabLogin: "Iniciar sesión",
    tabRegister: "Registrarse",
    headingLogin: "Inicia sesión en tu cuenta",
    headingRegister: "Crea tu cuenta",
    subtitle: "Inicia sesión para guardar tus dispositivos y tus historiales de reparación, y sincronizarlos entre dispositivos.",
    username: "Nombre de usuario",
    usernamePlaceholder: "3–32 letras, dígitos, guiones bajos o caracteres chinos",
    usernameHint: "Identificador único de la cuenta; el apodo puede cambiarse más adelante.",
    nickname: "Apodo",
    nicknamePlaceholder: "Opcional, por defecto el nombre de usuario",
    nicknameHint: "Nombre visible; se conserva al actualizar la página.",
    password: "Contraseña",
    passwordPlaceholder: "Mínimo 8 caracteres",
    confirm: "Confirmar contraseña",
    confirmPlaceholder: "Escribe la contraseña de nuevo",
    submitLogin: "Iniciar sesión",
    submitRegister: "Registrarse e iniciar sesión",
    busyLogin: "Iniciando sesión…",
    busyRegister: "Registrándose…",
    agreePrefix: "Al pulsar «Registrarse e iniciar sesión», aceptas",
    agreeAnd: "y",
    agreeSuffix: ".",
    termsName: "«Acuerdo de usuario»",
    privacyName: "«Política de privacidad»",
    guestHint: "También puedes hacer diagnósticos y ver dispositivos de demostración sin iniciar sesión; los datos de invitado solo se guardan en este dispositivo.",
    guestAction: "Probar sin cuenta",
    passwordChanged: "Tu contraseña cambió y se revocaron las sesiones anteriores. Inicia sesión de nuevo.",
    errUsernameRequired: "Introduce un nombre de usuario",
    errUsernameFormat: "El nombre de usuario debe tener 3–32 letras, dígitos, guiones bajos, guiones o caracteres chinos",
    errPasswordRequired: "Introduce una contraseña",
    errPasswordLength: "La contraseña debe tener al menos 8 caracteres",
    errConfirmMismatch: "Las dos contraseñas no coinciden",
    errNicknameLength: "El apodo debe tener como máximo 32 caracteres",
    errGeneric: "Algo salió mal; inténtalo de nuevo más tarde",
    privacy: "Política de privacidad",
    terms: "Licencia de software y condiciones del servicio",
    copyrightLink: "Aviso de derechos de autor",
    languageSetting: "Idioma",
    copyright: "Copyright © 2026 FixIt AI · ZengYingyi · ChenLin. All Rights Reserved.",
    loading: "Restaurando tu sesión…",
  },
  ru: {
    brand: "FixIt AI",
    brandSub: "ИИ-помощник по ремонту бытовой техники",
    tabLogin: "Войти",
    tabRegister: "Регистрация",
    headingLogin: "Вход в аккаунт",
    headingRegister: "Создать аккаунт",
    subtitle: "Войдите, чтобы сохранять устройства и историю ремонтов и синхронизировать их между устройствами.",
    username: "Имя пользователя",
    usernamePlaceholder: "3–32 символа: латинские буквы, цифры, подчёркивания или иероглифы",
    usernameHint: "Уникальный идентификатор для входа; никнейм можно изменить позже.",
    nickname: "Никнейм",
    nicknamePlaceholder: "Необязательно, по умолчанию — имя пользователя",
    nicknameHint: "Отображаемое имя; сохраняется после обновления страницы.",
    password: "Пароль",
    passwordPlaceholder: "Минимум 8 символов",
    confirm: "Подтвердите пароль",
    confirmPlaceholder: "Введите пароль ещё раз",
    submitLogin: "Войти",
    submitRegister: "Зарегистрироваться и войти",
    busyLogin: "Вход…",
    busyRegister: "Регистрация…",
    agreePrefix: "Нажимая «Зарегистрироваться и войти», вы соглашаетесь с",
    agreeAnd: "и",
    agreeSuffix: ".",
    termsName: "«Пользовательским соглашением»",
    privacyName: "«Политикой конфиденциальности»",
    guestHint: "Вы можете запускать диагностику и просматривать демо-устройства без входа; данные гостя хранятся только на этом устройстве.",
    guestAction: "Попробовать без входа",
    passwordChanged: "Пароль изменён, предыдущие сеансы завершены. Войдите снова с новым паролем.",
    errUsernameRequired: "Введите имя пользователя",
    errUsernameFormat: "Имя пользователя: 3–32 символа — латинские буквы, цифры, подчёркивания, дефисы или иероглифы",
    errPasswordRequired: "Введите пароль",
    errPasswordLength: "Пароль должен содержать минимум 8 символов",
    errConfirmMismatch: "Пароли не совпадают",
    errNicknameLength: "Никнейм — не более 32 символов",
    errGeneric: "Что-то пошло не так, попробуйте позже",
    privacy: "Политика конфиденциальности",
    terms: "Лицензия на ПО и условия обслуживания",
    copyrightLink: "Авторские права",
    languageSetting: "Язык",
    copyright: "Copyright © 2026 FixIt AI · ZengYingyi · ChenLin. All Rights Reserved.",
    loading: "Восстановление сеанса…",
  },
};

const LANGUAGES: { value: Locale; label: string }[] = [
  { value: "zh-Hans", label: "中文（简体）" },
  { value: "zh-Hant", label: "中文（繁體）" },
  { value: "en", label: "English" },
  { value: "ja", label: "日本語" },
  { value: "ko", label: "한국어" },
  { value: "fr", label: "Français" },
  { value: "de", label: "Deutsch" },
  { value: "es", label: "Español" },
  { value: "ru", label: "Русский" },
];

/** 登录 / 注册门户页（独立于应用外壳，参考微信网页版登录页的信息层级） */
export default function Login() {
  useApplyPrefs();

  const [params] = useSearchParams();
  const navigate = useNavigate();
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);
  const authError = useAuthStore((s) => s.error);
  const hydrate = useAuthStore((s) => s.hydrate);
  const { locale, setLocale } = useLocale();
  const t = TEXT[locale];

  const returnTo = safeReturnTo(params.get("returnTo"));
  const reason = params.get("reason");
  const [tab, setTab] = useState<Tab>(
    params.get("mode") === "register" ? "register" : "login"
  );
  const [username, setUsername] = useState("");
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** 页脚语言菜单开合状态 */
  const [langOpen, setLangOpen] = useState(false);
  const langMenuRef = useRef<HTMLDivElement>(null);

  // 点击语言菜单外部或按 Esc 关闭菜单。
  // 不能用 fixed 遮罩：footer 带 backdrop-blur，会创建 containing block 使 fixed 失效。
  useEffect(() => {
    if (!langOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (!langMenuRef.current?.contains(e.target as Node)) setLangOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setLangOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [langOpen]);

  // 登录页已脱离 AppLayout，需要自行恢复服务端会话
  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  // 已登录用户直接回到来源页，不在门户页停留
  useEffect(() => {
    if (status === "authenticated" && user) {
      navigate(returnTo, { replace: true });
    }
  }, [status, user, returnTo, navigate]);

  function switchTab(next: Tab) {
    if (busy) return;
    setTab(next);
    setErrors({});
    setFormError(null);
  }

  function validate(): boolean {
    const next: FieldErrors = {};
    const name = username.trim();
    if (!name) next.username = t.errUsernameRequired;
    else if (!USERNAME_RE.test(name)) next.username = t.errUsernameFormat;
    if (tab === "register" && nickname.trim().length > 32)
      next.nickname = t.errNicknameLength;
    if (!password) next.password = t.errPasswordRequired;
    else if (password.length < 8) next.password = t.errPasswordLength;
    if (tab === "register" && password !== confirm)
      next.confirm = t.errConfirmMismatch;
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit() {
    if (busy) return;
    setFormError(null);
    if (!validate()) return;
    setBusy(true);
    try {
      if (tab === "login") {
        await login(username.trim(), password);
      } else {
        await register(username.trim(), password, nickname.trim() || undefined);
      }
      navigate(returnTo, { replace: true });
    } catch (e) {
      setFormError((e as Error).message || t.errGeneric);
    } finally {
      setBusy(false);
    }
  }

  if (status === "loading" || (status === "authenticated" && user)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loading label={t.loading} />
      </div>
    );
  }

  return (
    <div
      className="relative flex min-h-screen flex-col overflow-hidden"
      style={{
        background:
          "linear-gradient(160deg, #f7f6f1 0%, #fbf2ec 42%, #f1ece3 100%)",
      }}
    >
      {/* 背景光斑（纯装饰，不影响可读性） */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-brand-200/40 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -right-20 h-80 w-80 rounded-full bg-brand-100/60 blur-3xl"
      />

      {/* 左上角品牌区 */}
      <header className="relative z-10 flex items-center px-5 pt-6 sm:px-10">
        <BrandMark />
      </header>

      {/* 中央登录卡片 */}
      <main className="relative z-10 flex flex-1 items-center justify-center px-4 py-8 sm:py-12">
        <section className="w-full max-w-[420px] rounded-2xl bg-surface p-6 shadow-card ring-1 ring-stone-200/70 sm:p-8">
          <h1 className="text-xl font-bold text-stone-900">
            {tab === "login" ? t.headingLogin : t.headingRegister}
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-stone-500">
            {t.subtitle}
          </p>

          {reason === "password_changed" && (
            <p
              role="status"
              className="mt-4 rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800"
            >
              {t.passwordChanged}
            </p>
          )}
          {authError && (
            <p
              role="note"
              className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
            >
              {authError}
            </p>
          )}

          {/* 登录 / 注册切换 */}
          <div
            role="tablist"
            aria-label={t.headingLogin}
            className="mt-5 grid grid-cols-2 gap-1 rounded-xl bg-stone-100 p-1"
          >
            {(["login", "register"] as Tab[]).map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => switchTab(key)}
                className={[
                  "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  tab === key
                    ? "bg-surface text-brand-700 shadow-sm"
                    : "text-stone-500 hover:text-stone-700",
                ].join(" ")}
              >
                {key === "login" ? t.tabLogin : t.tabRegister}
              </button>
            ))}
          </div>

          <form
            className="mt-5 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <InputField
              label={t.username}
              required
              maxLength={32}
              placeholder={t.usernamePlaceholder}
              description={t.usernameHint}
              value={username}
              error={errors.username}
              onChange={(v) => setUsername(v)}
            />

            {tab === "register" && (
              <InputField
                label={t.nickname}
                maxLength={32}
                placeholder={t.nicknamePlaceholder}
                description={t.nicknameHint}
                value={nickname}
                error={errors.nickname}
                onChange={(v) => setNickname(v)}
              />
            )}

            <InputField
              label={t.password}
              required
              type="password"
              maxLength={128}
              placeholder={t.passwordPlaceholder}
              value={password}
              error={errors.password}
              onChange={(v) => setPassword(v)}
            />

            {tab === "register" && (
              <InputField
                label={t.confirm}
                required
                type="password"
                maxLength={128}
                placeholder={t.confirmPlaceholder}
                value={confirm}
                error={errors.confirm}
                onChange={(v) => setConfirm(v)}
              />
            )}

            {tab === "register" && (
              <p className="text-xs leading-relaxed text-stone-500">
                {t.agreePrefix}
                <Link
                  to="/terms"
                  className="text-brand-700 underline underline-offset-2 hover:text-brand-800"
                >
                  {t.termsName}
                </Link>
                {t.agreeAnd}
                <Link
                  to="/privacy"
                  className="text-brand-700 underline underline-offset-2 hover:text-brand-800"
                >
                  {t.privacyName}
                </Link>
                {t.agreeSuffix}
              </p>
            )}

            {formError && (
              <p
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              >
                {formError}
              </p>
            )}

            <Button type="submit" size="lg" className="w-full" disabled={busy}>
              {tab === "login" ? (
                <>
                  <LogIn className="h-4 w-4" />
                  {busy ? t.busyLogin : t.submitLogin}
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4" />
                  {busy ? t.busyRegister : t.submitRegister}
                </>
              )}
            </Button>
          </form>


        </section>
      </main>

      {/* 底部信息栏：语言切换 + 法务链接 + 版权声明 */}
      <footer className="relative z-10 border-t border-stone-200/70 bg-surface/70 px-4 py-3 backdrop-blur sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 text-xs text-stone-500 sm:flex-row sm:justify-between">
          <nav
            aria-label="页脚导航"
            className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1"
          >
            {/* 语言设置：单入口，展开选择语言 */}
            <div className="relative" ref={langMenuRef}>
              <button
                type="button"
                onClick={() => setLangOpen((v) => !v)}
                aria-haspopup="listbox"
                aria-expanded={langOpen}
                className="inline-flex items-center gap-1 transition-colors hover:text-brand-700 hover:underline"
              >
                <Globe className="h-3.5 w-3.5" aria-hidden />
                {t.languageSetting}
                <ChevronDown
                  className={[
                    "h-3 w-3 transition-transform",
                    langOpen ? "rotate-180" : "",
                  ].join(" ")}
                  aria-hidden
                />
              </button>

              {langOpen && (
                <div
                  role="listbox"
                    aria-label={t.languageSetting}
                    className="absolute bottom-full left-0 z-20 mb-2 max-h-64 w-44 overflow-y-auto rounded-xl border border-stone-200 bg-surface py-1 shadow-card"
                  >
                    {LANGUAGES.map((lang) => (
                      <button
                        key={lang.value}
                        type="button"
                        role="option"
                        aria-selected={locale === lang.value}
                        onClick={() => {
                          setLocale(lang.value);
                          setLangOpen(false);
                        }}
                        className={[
                          "flex w-full items-center justify-between px-3 py-2 text-left text-xs transition-colors",
                          locale === lang.value
                            ? "font-semibold text-brand-700"
                            : "text-stone-600 hover:bg-stone-50",
                        ].join(" ")}
                      >
                        {lang.label}
                        {locale === lang.value && (
                          <Check className="h-3.5 w-3.5" aria-hidden />
                        )}
                      </button>
                    ))}
                </div>
              )}
            </div>

            <span aria-hidden className="h-3 w-px bg-stone-300" />

            <Link
              to="/privacy"
              className="transition-colors hover:text-brand-700 hover:underline"
            >
              {t.privacy}
            </Link>
            <Link
              to="/terms"
              className="transition-colors hover:text-brand-700 hover:underline"
            >
              {t.terms}
            </Link>
            <Link
              to="/copyright"
              className="transition-colors hover:text-brand-700 hover:underline"
            >
              {t.copyrightLink}
            </Link>
          </nav>

          <p className="text-center text-stone-400 sm:text-right">
            {t.copyright}
          </p>
        </div>
      </footer>
    </div>
  );
}
