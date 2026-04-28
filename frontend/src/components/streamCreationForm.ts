import { render, screen, fireEvent } from "@testing-library/react";
import StreamCreationForm from "../components/StreamCreationForm";

test("StreamCreationForm — validation errors shown", () => {
  render(<StreamCreationForm />);

  fireEvent.click(screen.getByText(/create/i));

  expect(screen.getByText(/invalid/i)).toBeInTheDocument();
});