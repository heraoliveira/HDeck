; Desinstalador pergunta se apaga os dados em %APPDATA%\HDeck (Seção 14).
!macro customUnInstall
  ${ifNot} ${isUpdated}
    MessageBox MB_YESNO|MB_ICONQUESTION "Apagar também os dados do HDeck (grupos, contas, logins salvos e configurações)?$\r$\nSem isso, eles ficam guardados para uma nova instalação." /SD IDNO IDNO naoApagar
      RMDir /r "$APPDATA\HDeck"
    naoApagar:
  ${endIf}
!macroend
