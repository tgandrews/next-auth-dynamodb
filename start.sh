#!/bin/bash
set -e

project_path="~/src/next-auth-dynamodb";
session_name="next-auth-dynamodb";
window_number=1;

is_started=$(tmux ls 2>/dev/null | grep $session_name | wc -l);
if [ $is_started -eq 1 ]; then
  tmux attach -t $session_name;
  exit;
fi

startProcess() {
  window_identity="$session_name:$window_number";
  application_path="$project_path";
  tmux new-window -t $window_identity -n $1;
  tmux split-window -h -t $window_identity;
  tmux send-keys -t "$window_identity.0" "cd $application_path && $2" Enter
  tmux send-keys -t "$window_identity.1" "cd $application_path" Enter
  window_number=$(($window_number + 1))
}

tmux new-session -d -s $session_name -t $session_name;

startProcess 'test' 'npm run test -- --watch';

tmux select-window -t $session_name:1;
tmux -2 attach-session -t $session_name;
