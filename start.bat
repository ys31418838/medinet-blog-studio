@echo off
chcp 65001 > nul
rem 구글 드라이브 폴더에서는 npm 설치가 깨지므로, 내 PC(로컬)에 복사해서 실행합니다.
set "SRC=%~dp0"
set "APP=%LOCALAPPDATA%\medinet-blog-studio"
rem 프롬프트 .txt 는 드라이브 원본을 바로 읽습니다 (고치면 다음 글부터 반영)
set "PROMPT_DIR=%SRC%prompts"

echo 최신 파일을 실행 폴더로 복사하는 중...
robocopy "%SRC%." "%APP%" /E /XD node_modules .claude /XF start.bat /NFL /NDL /NJH /NJS /NP > nul

cd /d "%APP%"
if not exist node_modules\@anthropic-ai\sdk (
  echo 처음 실행이라 필요한 파일을 설치합니다. 1분 정도 걸려요...
  call npm install --no-audit --no-fund
)

start "" http://localhost:3300
node server.js
pause
