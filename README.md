# 협곡 문철

롤 장면을 YouTube 링크로 제보하고, 포지션별 과실비율을 커뮤니티가 판정하는 Next.js MVP입니다.

## 로컬 실행

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:3000`을 엽니다.

## 맥미니 서버 실행

맥미니에서 처음 한 번:

```bash
git clone https://github.com/rlagusghvv/mooncheck.git
cd mooncheck
npm install
npm run build
```

수동 실행:

```bash
PORT=3000 npm run start:public
```

같은 집 네트워크에서는 `http://맥미니IP:3000`으로 접속할 수 있습니다.

## 외부 공개

가장 간단한 방식은 Cloudflare Tunnel입니다. 공유기 포트포워딩 없이 외부 HTTPS 주소를 붙일 수 있습니다.

```bash
brew install cloudflared
cloudflared tunnel login
cloudflared tunnel create mooncheck
cloudflared tunnel route dns mooncheck mooncheck.example.com
cloudflared tunnel run --url http://localhost:3000 mooncheck
```

도메인이 없다면 테스트용 임시 URL:

```bash
cloudflared tunnel --url http://localhost:3000
```

## launchd로 상시 실행

`scripts/install-launchd.sh` 안의 `APP_DIR` 값을 맥미니의 실제 프로젝트 경로로 바꾼 뒤 실행합니다.

```bash
chmod +x scripts/install-launchd.sh
./scripts/install-launchd.sh
```

상태 확인:

```bash
launchctl print gui/$(id -u)/com.mooncheck.web
```

중지:

```bash
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.mooncheck.web.plist
```

로그:

```bash
tail -f /tmp/mooncheck.out.log
tail -f /tmp/mooncheck.err.log
```

## 데이터 저장

현재 MVP는 `.mooncheck-data/cases.json`에 데이터를 저장합니다. 이 폴더는 git에 올리지 않습니다.

실서비스 확장 시 우선순위:

1. PostgreSQL + Prisma로 저장소 교체
2. Auth.js/Google/Discord 로그인
3. 신고/관리자 페이지
4. YouTube URL 검증과 타임스탬프 자동 파싱
5. Cloudflare Tunnel 또는 VPS 배포 고정
