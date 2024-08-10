
export function provideEmptyVdQuestion() {
  return {
    value: 20,
    type: 'N',
    question: "",
    answer: "",
  };
}

export function provideEmptyKdQuestion() {
  return {
    question: "",
    answer: "",
    type: 'N',
  };
}

export function provideEmptyTtQuestion(id) {
  return {
    id,
    question: "",
    answer: "",
    type: "TT_IMG",
  };
}

export function provideEmptyChpQuestion() {
  return {
    question: "",
    answer: "",
  };
}
