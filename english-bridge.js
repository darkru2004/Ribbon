function settleReward(record) {
  const badge = byId('coin-reward');
  badge.textContent = '코인 보상 확인 중…';
  Promise.resolve().then(() => reward(record)).then(message => {
    if (quizSession?.id === record.id) badge.textContent = message;
  }).catch(() => {
    if (quizSession?.id === record.id) badge.textContent = '코인 보상을 저장할 수 없어.';
  });
}

byId('use-keyboard').addEventListener('click', () => {
  if (graded) return;
  inkRevision += 1;
  pendingRecognition = null;
  refreshInkControls();
  transcript.hidden = false;
  answer.readOnly = false;
  byId('check').hidden = false;
  byId('ink-help').textContent = '단어를 입력하고 채점하기를 눌러 줘.';
  answer.focus();
});

const openWritingQuestion = loadQuestion;
loadQuestion = function () {
  openWritingQuestion();
  byId('use-keyboard').hidden = false;
  byId('ink-help').textContent = '펜으로 쓰거나 키보드로 답해 줘.';
};
const gradeWritingQuestion = grade;
grade = function (skipped) {
  gradeWritingQuestion(skipped);
  byId('use-keyboard').hidden = graded;
};

readBook();
loadEditor();
openHome(false);
return stopSpeech;
