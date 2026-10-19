#!/bin/sh
# floe-container-router — escreve à mão enquanto o build servidor do Floe não
# instala o seu próprio shim (~/.local/share/floe/cli/floe.mjs não existe aqui).
# Contrato: os comandos do Floe em worktree containerizada chegam como
# `floe php artisan ...` / `floe npm run dev ...`; roteamos para o container app
# do compose gerado em <worktree>/.floe/docker-compose.yml.
#
# Killing the `docker compose exec` client does not stop the process it started
# in the container. So the command runs in its own process group there, with its
# pgid in a pidfile, and a stop signal here kills that group. The pidfile is
# keyed by the command line: Floe never runs one command twice in a worktree, so
# a live group under the same file is an orphan from a client that died without
# the chance to stop it (SIGKILL), and is cleared before the new run.
compose=
dir=$(pwd)
while [ "$dir" != "/" ]; do
	if [ -f "$dir/.floe/docker-compose.yml" ]; then
		compose="$dir/.floe/docker-compose.yml"
		break
	fi
	dir=$(dirname "$dir")
done
if [ -z "$compose" ]; then
	echo "floe: no .floe/docker-compose.yml found from $(pwd)" >&2
	exit 127
fi

pidfile=/tmp/floe-cmd-$(printf '%s\n' "$@" | sha1sum | cut -c1-12).pid

# Runs in the container: $1 is the pidfile, the rest the command. dash's `kill`
# cannot take a process group, so groups go through pkill -g.
inner='
pf=$1; shift
if [ -f "$pf" ]; then
	old=$(cat "$pf")
	pkill -TERM -g "$old" && sleep 2
	pkill -KILL -g "$old"
fi
setsid "$@" &
pid=$!
echo "$pid" > "$pf"
wait "$pid"
code=$?
rm -f "$pf"
exit "$code"'

stop() {
	docker compose -f "$compose" exec -T app sh -c '[ -f "$1" ] && pkill -TERM -g "$(cat "$1")"' floe "$pidfile"
}
# The client goes too, so a stop that could not reach the container still ends
# this command; the group it left is cleared on the next run.
trap 'stop; kill "$child" 2>/dev/null; wait "$child"; exit 143' TERM INT HUP

docker compose -f "$compose" exec -T app sh -c "$inner" floe "$pidfile" "$@" &
child=$!
wait "$child"
