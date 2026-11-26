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
  byId('ink-help').textContent = '쓴 답과 같으면 채점하고, 다르면 획을 고쳐 다시 인식해 줘.';
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
