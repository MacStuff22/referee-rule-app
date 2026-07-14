import QuestionForm from '@/components/admin/question-form'

export default function NewQuestionPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Add New Question</h1>
      <QuestionForm />
    </div>
  )
}
