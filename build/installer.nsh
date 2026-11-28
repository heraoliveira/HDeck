; Instalação por cima (Seção 14): o HDeck e o motor das páginas são fechados antes de copiar os arquivos,
; senão o Windows mantém os arquivos velhos em uso e a versão antiga continua. Os dados em %APPDATA%\HDeck
; não são tocados (ficam para a versão nova).
!macro customCheckAppRunning
  nsExec::Exec 'taskkill /F /T /IM hdeck-motor.exe'
  nsExec::Exec 'taskkill /F /T /IM HDeck.exe'
  Sleep 1500
!macroend

; Desinstalador pergunta se apaga os dados em %APPDATA%\HDeck (Seção 14).
!macro customUnInstall
  ${ifNot} ${isUpdated}
    MessageBox MB_YESNO|MB_ICONQUESTION "Apagar também os dados do HDeck (grupos, contas, logins salvos e configurações)?$\r$\nSem isso, eles ficam guardados para uma nova instalação." /SD IDNO IDNO naoApagar
      RMDir /r "$APPDATA\HDeck"
    naoApagar:
  ${endIf}
!macroend
