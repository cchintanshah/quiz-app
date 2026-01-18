let questions = [];
let currentIndex = 0;
let score = 0;
let showFeedback = false;
let userAnswers = [];

fetch("questions.json")
  .then(res => res.json())
  .then(data => {
    questions = shuffle(data);
    renderQuestion();
  });

function renderQuestion() {
  const q = questions[currentIndex];
  showFeedback = false;

  updateProgress();

  document.getElementById("question").innerText = q.question;
  document.getElementById("feedback").innerHTML = "";
  document.getElementById("options").innerHTML = "";

  const inputType = q.type === "multi" ? "checkbox" : "radio";

  Object.entries(q.options).forEach(([key, value]) => {
    document.getElementById("options").innerHTML += `
      <label>
        <input type="${inputType}" name="option" value="${key}">
        ${key}. ${value}
      </label>
    `;
  });
}

document.getElementById("nextBtn").addEventListener("click", () => {
  if (!showFeedback) {
    evaluateAnswer();
  } else {
    currentIndex++;
    if (currentIndex < questions.length) {
      renderQuestion();
    } else {
      showFinalResult();
    }
  }
});

function evaluateAnswer() {
  const q = questions[currentIndex];
  const selected = Array.from(
    document.querySelectorAll("input[name='option']:checked")
  ).map(i => i.value);

  userAnswers[currentIndex] = selected;

  document
    .querySelectorAll("input[name='option']")
    .forEach(i => i.disabled = true);

  const isCorrect =
    selected.length === q.correct.length &&
    selected.every(a => q.correct.includes(a));

  if (isCorrect) {
    score++;
    feedback.innerHTML =
      `<div class="correct">Correct selection answer is: ${q.correct.join(", ")}</div>`;
  } else {
    feedback.innerHTML =
      `<div class="incorrect">Incorrect selection, the answer is: ${q.correct.join(", ")}</div>`;
  }

  showFeedback = true;
}

function showFinalResult() {
  document.getElementById("question").innerText =
    `Quiz Completed! Score: ${score}/${questions.length}`;

  document.getElementById("options").innerHTML = "";
  document.getElementById("feedback").innerHTML = "";
  document.getElementById("nextBtn").classList.add("hidden");
  document.getElementById("retryBtn").classList.remove("hidden");

  showReview();
}

function showReview() {
  const reviewDiv = document.getElementById("review");
  reviewDiv.classList.remove("hidden");
  reviewDiv.innerHTML = "<h3>Review</h3>";

  questions.forEach((q, i) => {
    const user = userAnswers[i]?.join(", ") || "None";
    const correct = q.correct.join(", ");

    const isCorrect =
      userAnswers[i] &&
      userAnswers[i].length === q.correct.length &&
      userAnswers[i].every(a => q.correct.includes(a));

    reviewDiv.innerHTML += `
      <div class="review-item">
        <strong>${q.question}</strong><br>
        Your answer: ${user}<br>
        Correct answer: ${correct}<br>
        <span class="${isCorrect ? "correct" : "incorrect"}">
          ${isCorrect ? "Correct" : "Incorrect"}
        </span>
      </div>
    `;
  });
}

document.getElementById("retryBtn").addEventListener("click", () => {
  currentIndex = 0;
  score = 0;
  userAnswers = [];
  questions = shuffle(questions);

  document.getElementById("review").classList.add("hidden");
  document.getElementById("retryBtn").classList.add("hidden");
  document.getElementById("nextBtn").classList.remove("hidden");

  renderQuestion();
});

function updateProgress() {
  document.getElementById("progressText").innerText =
    `Question ${currentIndex + 1} of ${questions.length}`;

  document.getElementById("progressFill").style.width =
    ((currentIndex) / questions.length) * 100 + "%";
}

function shuffle(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}
