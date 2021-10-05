import { Component, OnInit } from '@angular/core';
import {TaskService} from '../../task.service';
import {ActivatedRoute, Params, Router} from '@angular/router';
import {Task} from '../../models/task.model';
import {List} from '../../models/list.model';

@Component({
  selector: 'app-task-view',
  templateUrl: './task-view.component.html',
  styleUrls: ['./task-view.component.scss']
})
export class TaskViewComponent implements OnInit {

  lists: List[];
  tasks: Task[];
  selectedListId: string;

  constructor(private taskService: TaskService, private route: ActivatedRoute, private router: Router) { }

  ngOnInit(): void {
    this.route.params.subscribe(
      (params: Params) => {
        if (params.listId) {
          this.selectedListId = params.listId;
          this.taskService.getTasks(params.listId).subscribe((tasks: any[]) => {
            this.tasks = tasks;
          });11111111111111111111111111111111111111111
        } else {
          this.tasks = undefined;
        }
      }
    );

    this.taskService.getLists().subscribe((lists: any[]) => {
      this.lists = lists;
    });
  }

  onTaskClick(task: Task) {
    // set a task to be completed
    this.taskService.complete(task).subscribe(() => {
      console.log('Completed successfully.');
      task.completed = !task.completed;
    });
  }

  onDeleteListClick() {
    this.taskService.deleteList(this.selectedListId).subscribe((res: any) => {
      this.router.navigate(['/lists']);
      console.log('List deleted.');
    });
  }

  onDeleteTaskClick(id: string) {
    this.taskService.deleteTask(this.selectedListId, id).subscribe((res: any) => {
      this.tasks = this.tasks.filter(val => val._id !== id);
      console.log('Task deleted.');
    });
  }

}
